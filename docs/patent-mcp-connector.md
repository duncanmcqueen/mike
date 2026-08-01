# USPTO Patent and Trademark MCP Connector

Mike includes a managed connector for
[`riemannzeta/patent_mcp_server`](https://github.com/riemannzeta/patent_mcp_server).
The backend launches version `0.9.5` locally over MCP stdio using Python 3.13
and the MCP Python SDK 1.x compatibility line. It does not expose an arbitrary
command field in the web interface.

## Prerequisites

1. Install [`uv`](https://docs.astral.sh/uv/getting-started/installation/) on
   the machine running the Mike backend.
2. Confirm both commands are visible to the same operating-system user that
   runs Mike:

   ```bash
   uv --version
   uvx --version
   ```

3. Make sure the backend can reach PyPI and the USPTO services used by the MCP
   server. The first connector setup can take longer while `uvx` downloads the
   pinned package; later launches use the `uv` cache. Mike defaults that cache
   to `backend/data/uv` so it works for service accounts with read-only
   home directories. The cache, tool environments, and any managed Python
   installs are all contained there.

## Optional USPTO Credentials

Public Patent Public Search (PPUBS), trademark search, and trademark assignment
tools work without API keys. Add keys to `backend/.env` to enable the server's
credentialed data sources:

```bash
# USPTO Open Data Portal and PTAB tools
USPTO_API_KEY=replace-with-your-uspto-odp-key

# TSDR trademark status and document tools
TSDR_API_KEY=replace-with-your-uspto-tsdr-key

# Optional, only when the trademark-search endpoint requires a WAF token
TMSEARCH_WAF_TOKEN=replace-with-your-waf-token
```

Restart the backend after changing environment variables. Mike passes only the
MCP SDK's safe default environment and the connector's documented settings to
the child process. Credentials are not stored in connector rows or returned to
the browser.

## Enable In Mike

1. Open **Account > Connectors**.
2. Select **USPTO**.
3. Wait for Mike to launch the server and import its tool catalog.
4. Open the **USPTO Patent & Trademark** connector details.
5. Review the imported tools and disable any tools you do not want exposed to
   assistant conversations.

Provisioning is idempotent: selecting **USPTO** again refreshes the same
connector instead of creating a duplicate. Tool refreshes preserve your prior
enabled/disabled selections. Tools marked destructive or non-read-only by the
server remain disabled under Mike's existing confirmation policy.

The upstream project currently advertises 61 tools, with 36 active and 25
retained but unavailable because upstream USPTO APIs were retired. An imported
tool can therefore be present even when its underlying service is unavailable.

## Run From A Local Checkout

For development, Mike can run a checked-out copy instead of the pinned PyPI
artifact:

```bash
git clone https://github.com/riemannzeta/patent_mcp_server.git
cd patent_mcp_server
git checkout v0.9.5
uv sync
```

Then set the absolute checkout path in `backend/.env`:

```bash
PATENT_MCP_DIRECTORY=/absolute/path/to/patent_mcp_server

# Optional uv data override; the backend service user must be able to write here
PATENT_MCP_UV_DATA_DIR=/absolute/path/to/a/writable/uv-data-directory
```

Restart the backend and select **USPTO** again to refresh the tool catalog.
Mike will run:

```bash
uv --directory "$PATENT_MCP_DIRECTORY" run \
  --python 3.13 \
  --with 'mcp[cli]>=1.28,<2' \
  patent-mcp-server
```

Without `PATENT_MCP_DIRECTORY`, Mike runs:

```bash
uvx --python 3.13 \
  --from patent-mcp-server==0.9.5 \
  --with 'mcp[cli]>=1.28,<2' \
  patent-mcp-server
```

The explicit Python and MCP SDK constraints are required. Version `0.9.5`
imports the v1 `mcp.server.fastmcp` module and declares Python `<3.14`, but its
published dependency metadata does not exclude the incompatible MCP SDK 2.x.

## Troubleshooting

**The preset request says `spawn uvx ENOENT`.** Install `uv`, make sure `uvx`
is on the backend service user's `PATH`, and restart that service.

**Setup times out on the first attempt.** Run the pinned `uvx` command above
once as the backend service user, then retry. This isolates package download or
network failures from Mike.

**Some tools fail with an API-key message.** Configure the matching key above.
`USPTO_API_KEY` and `TSDR_API_KEY` are separate credentials.

**A retired tool fails.** Disable it in connector details. The upstream README
tracks active and unavailable tools.

**No tools appear.** Open the connector details and use **Refresh tools** after
checking the backend logs. The connector can be disabled, but managed local
connectors cannot be deleted or repointed from the browser.

## Upstream References

- [Source and server configuration](https://github.com/riemannzeta/patent_mcp_server)
- [Published Python package](https://pypi.org/project/patent-mcp-server/)
