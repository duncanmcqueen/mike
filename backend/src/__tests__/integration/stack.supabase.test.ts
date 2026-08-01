import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This exercises the real upstream Supabase contract rather than mocks. It is
// skipped during ordinary unit runs unless a disposable Supabase test stack is
// explicitly supplied.
const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const maybeDescribe = url && serviceKey && anonKey ? describe : describe.skip;

const PUBLIC_TABLES = [
  "chat_messages",
  "chats",
  "contact_messages",
  "courtlistener_citation_index",
  "courtlistener_opinion_cluster_index",
  "document_edits",
  "document_versions",
  "documents",
  "hidden_workflows",
  "gmail_connections",
  "gmail_oauth_states",
  "legal_monitor_connector_items",
  "legal_monitor_documents",
  "legal_monitor_runs",
  "legal_monitor_source_items",
  "legal_monitor_sources",
  "legal_monitors",
  "library_folders",
  "project_subfolders",
  "projects",
  "playbook_imports",
  "playbook_runs",
  "playbook_versions",
  "playbooks",
  "saved_prompts",
  "support_feedback",
  "tabular_cells",
  "tabular_review_chat_messages",
  "tabular_review_chats",
  "tabular_reviews",
  "user_api_keys",
  "user_mcp_connector_tools",
  "user_mcp_connectors",
  "user_mcp_oauth_states",
  "user_mcp_oauth_tokens",
  "user_mcp_tool_audit_logs",
  "user_profiles",
  "workflow_open_source_submissions",
  "workflow_shares",
  "workflows",
];

maybeDescribe("Supabase stack — auth contract and RLS firewall", () => {
  const password = "StackTest1!";
  const emailA = `stack-a-${Date.now()}@test.local`;
  const emailB = `stack-b-${Date.now()}@test.local`;

  let admin: SupabaseClient;
  let userA = "";
  let userB = "";
  let tokenA = "";
  let projectId = "";

  const asUser = (token: string) =>
    createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    const b = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (a.error || !a.data.user) throw a.error ?? new Error("no user A");
    if (b.error || !b.data.user) throw b.error ?? new Error("no user B");
    userA = a.data.user.id;
    userB = b.data.user.id;

    const signIn = await createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({ email: emailA, password });
    if (signIn.error || !signIn.data.session) {
      throw signIn.error ?? new Error("no session for A");
    }
    tokenA = signIn.data.session.access_token;

    const project = await admin
      .from("projects")
      .insert({ user_id: userA, name: "Stack Test Project" })
      .select("id")
      .single();
    if (project.error || !project.data) {
      throw project.error ?? new Error("no project");
    }
    projectId = project.data.id;
  });

  afterAll(async () => {
    if (projectId) await admin.from("projects").delete().eq("id", projectId);
    if (userA) await admin.auth.admin.deleteUser(userA);
    if (userB) await admin.auth.admin.deleteUser(userB);
  });

  it("resolves an upstream Supabase access token to its user", async () => {
    const { data, error } = await admin.auth.getUser(tokenA);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(userA);
    expect(data.user?.email).toBe(emailA);
  });

  it("allows service-role access while denying the user data path", async () => {
    const serviceResult = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId);
    expect(serviceResult.error).toBeNull();
    expect(serviceResult.data ?? []).toHaveLength(1);

    const userResult = await asUser(tokenA)
      .from("projects")
      .select("id")
      .eq("id", projectId);
    expect(userResult.data ?? []).toHaveLength(0);
  });

  it("prevents a second tenant from reading the first tenant's project", async () => {
    const signInB = await createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({ email: emailB, password });
    const crossTenant = await asUser(signInB.data.session!.access_token)
      .from("projects")
      .select("id")
      .eq("id", projectId);
    expect(crossTenant.data ?? []).toHaveLength(0);
  });

  it("does not expose any public application table to the user data path", async () => {
    const client = asUser(tokenA);
    const leaks: string[] = [];
    for (const table of PUBLIC_TABLES) {
      const { data } = await client.from(table).select("*").limit(1);
      if ((data ?? []).length > 0) leaks.push(table);
    }
    expect(leaks).toEqual([]);
  });
});
