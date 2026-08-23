import { createServerSupabase } from "./supabase";
import {
    resolveModel,
    CLAUDE_LOW_MODELS,
    GEMINI_LOW_MODELS,
    OPENAI_LOW_MODELS,
    CLAUDE_MID_MODELS,
    GEMINI_MID_MODELS,
    OPENAI_MID_MODELS,
    type UserApiKeys,
} from "./llm";
import { legacyDefaultModel } from "./googleOauth";
import { getUserApiKeys as getStoredUserApiKeys } from "./userApiKeys";
import {
    getAllUserRouterModels,
    isRouterModelSelected,
    ROUTER_SLUGS,
    routerForModelId,
    type RouterModelSelections,
} from "./routerModels";

export type UserModelSettings = {
    title_model: string | null;
    tabular_model: string | null;
    legal_research_us: boolean;
    api_keys: UserApiKeys;
    personalisation?: {
        displayName: string | null;
        organisation: string | null;
        jurisdiction: string | null;
        practiceSetting: string | null;
        professionalTitle: string | null;
        practiceAreas: string[];
    };
};

type TierLists = {
    gemini: readonly string[];
    openai: readonly string[];
    claude: readonly string[];
};

const TITLE_TIERS: TierLists = {
    gemini: GEMINI_LOW_MODELS,
    openai: OPENAI_LOW_MODELS,
    claude: CLAUDE_LOW_MODELS,
};

const TABULAR_TIERS: TierLists = {
    gemini: GEMINI_MID_MODELS,
    openai: OPENAI_MID_MODELS,
    claude: CLAUDE_MID_MODELS,
};

function hasKey(value: unknown): boolean {
    return typeof value === "string" ? !!value.trim() : value === true;
}

// Pick the cheapest model of whichever provider the user can actually use:
// first-party keys by tier, then the user's saved router selections. When
// nothing is usable: Google-OAuth deployments keep their historical Gemini
// default; everywhere else this returns null and callers either skip the
// lightweight task or fail loudly — never a silent provider default.
export function resolveTierFallback(
    tiers: TierLists,
    keys: UserApiKeys | Record<string, unknown> | undefined,
    routerModels?: RouterModelSelections,
): string | null {
    if (hasKey(keys?.gemini)) return tiers.gemini[0];
    if (hasKey(keys?.openai)) return tiers.openai[0];
    if (hasKey(keys?.claude)) return tiers.claude[0];
    if (routerModels) {
        for (const slug of ROUTER_SLUGS) {
            const first = routerModels[slug]?.[0];
            if (hasKey(keys?.[slug]) && first) return `${slug}/${first}`;
        }
    }
    return legacyDefaultModel(tiers === TITLE_TIERS ? "title" : "tabular");
}

function resolveTitleModel(
    apiKeys: UserApiKeys,
    routerModels: RouterModelSelections,
): string | null {
    return resolveTierFallback(TITLE_TIERS, apiKeys, routerModels);
}

/** Cheapest usable model (low tier), or null. Booleans (ApiKeyStatus) work too. */
export function cheapModelFallback(
    keys: UserApiKeys | Record<string, unknown> | undefined,
    routerModels?: RouterModelSelections,
): string | null {
    return resolveTierFallback(TITLE_TIERS, keys, routerModels);
}

/** Mid-tier usable model (tabular-class work), or null. */
export function midModelFallback(
    keys: UserApiKeys | Record<string, unknown> | undefined,
    routerModels?: RouterModelSelections,
): string | null {
    return resolveTierFallback(TABULAR_TIERS, keys, routerModels);
}

export async function getUserModelSettings(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserModelSettings> {
    const client = db ?? createServerSupabase();
    const [profileResult, api_keys, routerModels] = await Promise.all([
        client
            .from("user_profiles")
            .select(
                "title_model, tabular_model, legal_research_us, display_name, organisation, jurisdiction, practice_setting, professional_title, practice_areas",
            )
            .eq("user_id", userId)
            .single(),
        getStoredUserApiKeys(userId, client),
        getAllUserRouterModels(userId, client),
    ]);
    let data = profileResult.data;

    // A database that predates the 20260821 onboarding migration rejects the
    // select above outright (unknown column), which would silently fall every
    // caller back to default models and re-enable US legal research for users
    // who turned it off. Retry with the pre-migration column set so saved
    // settings keep working; personalisation simply stays empty.
    if (profileResult.error?.code === "42703") {
        const legacy = await client
            .from("user_profiles")
            .select("title_model, tabular_model, legal_research_us")
            .eq("user_id", userId)
            .single();
        // A second failure (a database even older than the pre-migration
        // shape) keeps data null and falls through to the defaults below —
        // the pre-retry behavior, now explicit instead of accidental.
        data = legacy.error ? null : (legacy.data as typeof data);
    }

    // A stored preference can name a router model the user has since removed
    // from (or never had in) their saved selection — e.g. a hand-crafted
    // profile PATCH. Treat that exactly like an invalid model id and fall
    // back, so the env-key spend path can't be steered onto arbitrary
    // gateway models.
    const guardRouterModel = (
        model: string | null,
        fallback: string | null,
    ): string | null => {
        if (!model) return fallback;
        if (
            !routerForModelId(model) ||
            isRouterModelSelected(model, routerModels)
        ) {
            return model;
        }
        console.warn(
            `[router-models] user ${userId} preference "${model}" is outside their saved selection; using ${fallback ?? "no model"}`,
        );
        return fallback;
    };
    const titleFallback = resolveTitleModel(api_keys, routerModels);

    return {
        title_model: guardRouterModel(
            resolveModel(data?.title_model, ""),
            titleFallback,
        ) || null,
        tabular_model: guardRouterModel(
            resolveModel(data?.tabular_model, ""),
            resolveTierFallback(TABULAR_TIERS, api_keys, routerModels),
        ) || null,
        legal_research_us:
            (data as { legal_research_us?: boolean | null } | null)
                ?.legal_research_us !== false,
        personalisation: {
            displayName:
                typeof data?.display_name === "string"
                    ? data.display_name
                    : null,
            organisation:
                typeof data?.organisation === "string"
                    ? data.organisation
                    : null,
            jurisdiction:
                typeof data?.jurisdiction === "string"
                    ? data.jurisdiction
                    : null,
            practiceSetting:
                typeof data?.practice_setting === "string"
                    ? data.practice_setting
                    : null,
            professionalTitle:
                typeof data?.professional_title === "string"
                    ? data.professional_title
                    : null,
            practiceAreas: Array.isArray(data?.practice_areas)
                ? data.practice_areas.filter(
                      (area): area is string => typeof area === "string",
                  )
                : [],
        },
        api_keys,
    };
}

export async function getUserApiKeys(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserApiKeys> {
    const client = db ?? createServerSupabase();
    return getStoredUserApiKeys(userId, client);
}
