"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, Mail, Unlink } from "lucide-react";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { useQuickActionsPreference } from "@/app/components/assistant/quickActionsPreferences";
import {
    disconnectGmail,
    getGmailStatus,
    startGmailOAuth,
    type GmailStatus,
} from "@/app/lib/mikeApi";
import { AccountSection } from "../AccountSection";
import { AccountToggle } from "../AccountToggle";
import {
    deploymentModuleEnabled,
    featureEnabled,
    USER_FEATURE_CATALOG,
    type UserFeatureKey,
} from "@/app/lib/featureFlags";

export default function FeaturesPage() {
    const {
        profile,
        updateLegalResearchUs,
        updateEmailIntegration,
        updateFeatureFlag,
    } = useUserProfile();
    const { visibleActions, showAllQuickActions, hideAllQuickActions } =
        useQuickActionsPreference();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [draftLegalResearchUs, setDraftLegalResearchUs] = useState<
        boolean | null
    >(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
    const [gmailBusy, setGmailBusy] = useState(false);
    const [gmailError, setGmailError] = useState<string | null>(null);
    const [featureSaving, setFeatureSaving] = useState<UserFeatureKey | null>(
        null,
    );
    const [featureError, setFeatureError] = useState<string | null>(null);
    const gmailDeploymentEnabled = profile
        ? deploymentModuleEnabled(profile.deploymentModules, "gmail")
        : false;

    const refreshGmailStatus = async () => {
        try {
            setGmailStatus(await getGmailStatus());
            setGmailError(null);
        } catch (error) {
            setGmailError(
                error instanceof Error ? error.message : "Could not load Gmail status.",
            );
        }
    };

    useEffect(() => {
        if (!profile) return;
        if (!gmailDeploymentEnabled) {
            setGmailStatus(null);
            setGmailError(null);
            return;
        }
        void refreshGmailStatus();
        const apiOrigin = new URL(
            process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
            window.location.origin,
        ).origin;
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== apiOrigin) return;
            if (event.data?.type !== "gmail_oauth_result") return;
            if (event.data.success) void refreshGmailStatus();
            else setGmailError(event.data.detail || "Gmail authorization failed.");
        };
        window.addEventListener("message", handleMessage);
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            window.removeEventListener("message", handleMessage);
        };
    }, [gmailDeploymentEnabled, profile]);

    async function handleEmailToggle(enabled: boolean) {
        if (gmailBusy || !gmailStatus?.available) return;
        setGmailBusy(true);
        setGmailError(null);
        const ok = await updateEmailIntegration(enabled);
        if (!ok) setGmailError("Could not update Email Integration.");
        await refreshGmailStatus();
        setGmailBusy(false);
    }

    async function handleConnectGmail() {
        if (gmailBusy) return;
        const popup = window.open("about:blank", "mike-gmail-oauth", "popup,width=620,height=760");
        setGmailBusy(true);
        setGmailError(null);
        try {
            const { authorizationUrl } = await startGmailOAuth();
            if (popup) popup.location.assign(authorizationUrl);
            else window.location.assign(authorizationUrl);
        } catch (error) {
            popup?.close();
            setGmailError(error instanceof Error ? error.message : "Could not start Gmail authorization.");
        } finally {
            setGmailBusy(false);
        }
    }

    async function handleDisconnectGmail() {
        if (gmailBusy) return;
        setGmailBusy(true);
        setGmailError(null);
        try {
            await disconnectGmail();
            await refreshGmailStatus();
        } catch (error) {
            setGmailError(error instanceof Error ? error.message : "Could not disconnect Gmail.");
        } finally {
            setGmailBusy(false);
        }
    }

    async function handleFeatureToggle(
        key: UserFeatureKey,
        enabled: boolean,
    ) {
        if (featureSaving) return;
        setFeatureSaving(key);
        setFeatureError(null);
        const ok = await updateFeatureFlag(key, enabled);
        if (!ok) {
            setFeatureError("Could not update that feature. Try again.");
        }
        setFeatureSaving(null);
    }

    const persistedLegalResearchUs = profile?.legalResearchUs ?? true;
    const usEnabled = draftLegalResearchUs ?? persistedLegalResearchUs;
    const hasChanges =
        draftLegalResearchUs !== null &&
        draftLegalResearchUs !== persistedLegalResearchUs;
    const quickActionsEnabled = Object.values(visibleActions).some(Boolean);

    const handleUpdateLegalResearch = async () => {
        if (saving) return;
        setSaved(false);
        setSaveError(null);
        setSaving(true);
        const ok = await updateLegalResearchUs(usEnabled);
        setSaving(false);
        if (ok) {
            setDraftLegalResearchUs(null);
            setSaved(true);
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            savedTimerRef.current = setTimeout(() => setSaved(false), 1600);
        } else {
            setSaveError("Could not update. Try again.");
        }
    };

    return (
        <div className="space-y-8">
            <p className="text-sm text-gray-500">
                Enable optional Mike modules for your account. Templates and
                presets are configured inside their module and appear only
                when this Mike instance provides their prerequisites.
            </p>
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-medium font-serif text-gray-900">
                        Assistant
                    </h2>
                </div>
                <AccountSection>
                    <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-900">
                                Quick actions
                            </p>
                            <p className="text-sm text-gray-500">
                                Show the quick actions row on the assistant
                                start screen.
                            </p>
                        </div>
                        <AccountToggle
                            checked={quickActionsEnabled}
                            size="md"
                            onChange={(checked) => {
                                if (checked) {
                                    showAllQuickActions();
                                } else {
                                    hideAllQuickActions();
                                }
                            }}
                        />
                    </div>
                </AccountSection>
            </section>

            {(["Workspace", "Integrations", "Models"] as const).map((group) => {
                const items = USER_FEATURE_CATALOG.filter(
                    (feature) => feature.group === group,
                );
                return (
                    <section key={group} className="space-y-3">
                        <h2 className="text-2xl font-medium font-serif text-gray-900">
                            {group}
                        </h2>
                        <AccountSection>
                            {items.map((feature, index) => {
                                const available = profile
                                    ? deploymentModuleEnabled(
                                          profile.deploymentModules,
                                          feature.key,
                                      )
                                    : false;
                                return (
                                <div key={feature.key}>
                                    {index > 0 && (
                                        <div className="mx-4 h-px bg-gray-100" />
                                    )}
                                    <div className="flex items-start justify-between gap-4 px-4 py-5">
                                        <div className="min-w-0 space-y-1">
                                            <p className="text-sm font-medium text-gray-900">
                                                {feature.name}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {feature.description}
                                            </p>
                                            {!available && (
                                                <p className="text-xs font-medium text-amber-700">
                                                    Not enabled for this deployment
                                                </p>
                                            )}
                                        </div>
                                        <AccountToggle
                                            checked={featureEnabled(
                                                profile?.featureFlags,
                                                feature.key,
                                                profile?.deploymentModules,
                                            )}
                                            loading={
                                                featureSaving === feature.key
                                            }
                                            disabled={
                                                !available ||
                                                (featureSaving !== null &&
                                                    featureSaving !== feature.key)
                                            }
                                            size="md"
                                            onChange={(enabled) =>
                                                void handleFeatureToggle(
                                                    feature.key,
                                                    enabled,
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                                );
                            })}
                        </AccountSection>
                    </section>
                );
            })}

            {featureError && (
                <p className="-mt-5 text-sm text-red-600">{featureError}</p>
            )}

            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-medium font-serif text-gray-900">
                        Legal Research
                    </h2>
                </div>
                <AccountSection>
                    <div className="px-4 py-5">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-900">
                                Jurisdiction
                            </p>
                            <p className="text-sm text-gray-500">
                                Choose which jurisdictions the assistant can
                                research. When a jurisdiction is enabled, its
                                case-law research tools are available in chat.
                            </p>
                        </div>
                        <div className="mt-4 flex items-start justify-between gap-3 px-3 bg-gray-50 py-3 rounded-md">
                            <label
                                htmlFor="jurisdiction-us"
                                className="min-w-0 cursor-pointer select-none"
                            >
                                <p className="text-sm text-gray-900">US</p>
                                <p className="text-sm text-gray-500">
                                    Enable US case law research (CourtListener)
                                    in chat.
                                </p>
                            </label>
                            <button
                                id="jurisdiction-us"
                                type="button"
                                role="checkbox"
                                aria-checked={usEnabled}
                                onClick={() => {
                                    setDraftLegalResearchUs(!usEnabled);
                                    setSaved(false);
                                    setSaveError(null);
                                }}
                                disabled={saving}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                    usEnabled
                                        ? "border-gray-950 bg-gray-950 text-white"
                                        : "border-gray-300 bg-white text-transparent"
                                } disabled:cursor-not-allowed disabled:opacity-45`}
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-3">
                            <p className="text-sm text-red-600">
                                {saveError ?? ""}
                            </p>
                            <button
                                type="button"
                                onClick={() => void handleUpdateLegalResearch()}
                                disabled={saving || !hasChanges}
                                className="text-sm font-medium text-gray-700 transition-colors hover:text-gray-950 disabled:cursor-not-allowed disabled:text-gray-300"
                            >
                                {saving
                                    ? "Updating..."
                                    : saved
                                      ? "Updated"
                                      : "Update"}
                            </button>
                        </div>
                    </div>
                </AccountSection>
            </section>

            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-medium font-serif text-gray-900">
                        Email Integration
                    </h2>
                </div>
                <AccountSection>
                    <div className="px-4 py-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-gray-500" />
                                    <p className="text-sm font-medium text-gray-900">Gmail</p>
                                </div>
                                <p className="text-sm text-gray-500">
                                    Search and attach email to Mike documents, and send material Monitor alerts.
                                </p>
                            </div>
                            <AccountToggle
                                checked={
                                    gmailDeploymentEnabled &&
                                    profile?.emailIntegrationEnabled === true
                                }
                                disabled={
                                    !gmailDeploymentEnabled ||
                                    !gmailStatus?.available
                                }
                                loading={gmailBusy}
                                size="md"
                                onChange={(checked) => void handleEmailToggle(checked)}
                            />
                        </div>

                        {!gmailDeploymentEnabled && (
                            <p className="mt-4 text-sm text-amber-700">
                                Gmail is not enabled for this Mike deployment.
                            </p>
                        )}

                        {gmailDeploymentEnabled && gmailStatus?.available === false && (
                            <p className="mt-4 text-sm text-gray-500">
                                Gmail is not configured for this Mike instance.
                            </p>
                        )}

                        {gmailDeploymentEnabled && gmailStatus?.available && profile?.emailIntegrationEnabled && (
                            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">
                                        {gmailStatus.connected ? "Connected" : "Not connected"}
                                    </p>
                                    {gmailStatus.email && (
                                        <p className="truncate text-sm text-gray-500">{gmailStatus.email}</p>
                                    )}
                                </div>
                                {gmailStatus.connected ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleDisconnectGmail()}
                                        disabled={gmailBusy}
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-950 disabled:opacity-45"
                                    >
                                        {gmailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                                        Disconnect
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void handleConnectGmail()}
                                        disabled={gmailBusy}
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-950 disabled:opacity-45"
                                    >
                                        {gmailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                                        Connect Gmail
                                    </button>
                                )}
                            </div>
                        )}

                        {gmailError && <p className="mt-3 text-sm text-red-600">{gmailError}</p>}
                    </div>
                </AccountSection>
            </section>
        </div>
    );
}
