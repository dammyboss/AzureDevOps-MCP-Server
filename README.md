# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that provides 69 tools for interacting with Azure DevOps. Supports both local Claude Desktop integration and remote deployment to Azure Functions.

## Features

- **Projects & Teams**: List projects, teams, and team members
- **Work Items**: Full CRUD, batch updates, linking, comments, backlogs
- **Git Repositories**: Repos, branches, commits, file content
- **Pull Requests**: Create, update, reviewers, threads, comments
- **Pipelines & Builds**: List, trigger, monitor, logs, stages
- **Iterations & Areas**: Sprint management, capacity planning
- **Wikis**: List, read, and create/update wiki pages
- **Test Plans**: Plans, suites, test cases, results
- **Search**: Code, work items, and wiki search
- **Advanced Security**: Security alerts and details

## Deployment Options

### Option 1: Local (Claude Desktop with Browser Auth)

Run locally with interactive browser authentication - best for personal use.

### Option 2: Azure Functions (Serverless)

Deploy to Azure Functions for a hosted solution - best for teams and sharing.

### Option 3: Remote Bridge (Claude Desktop → Azure Functions)

Connect Claude Desktop to a hosted Azure Functions instance.

---

## Quick Start: Local Setup

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/dami-ado-mcp-server.git
cd dami-ado-mcp-server
npm install
npm run build
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org
# Leave AZURE_DEVOPS_PAT empty to use browser authentication
```

### 3. Add to Claude Desktop

Add to your `claude_desktop_config.json`:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": ["C:\\path\\to\\dami-ado-mcp-server\\dist\\index.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-org"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

A browser window will open for authentication on first use.

---

## Azure Functions Deployment

### 1. Prerequisites

- Azure CLI installed and logged in (`az login`)
- Azure Functions Core Tools (`npm install -g azure-functions-core-tools@4`)

### 2. Create Azure Resources

```bash
# Create resource group
az group create --name my-ado-mcp-rg --location eastus

# Create storage account
az storage account create --name myadomcpstorage --location eastus \
  --resource-group my-ado-mcp-rg --sku Standard_LRS

# Create function app
az functionapp create --resource-group my-ado-mcp-rg \
  --consumption-plan-location eastus --runtime node --runtime-version 20 \
  --functions-version 4 --name my-ado-mcp-server \
  --storage-account myadomcpstorage
```

### 3. Configure Settings

```bash
# Set Azure DevOps org URL
az functionapp config appsettings set --name my-ado-mcp-server \
  --resource-group my-ado-mcp-rg \
  --settings AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org

# Set PAT token (required for serverless)
az functionapp config appsettings set --name my-ado-mcp-server \
  --resource-group my-ado-mcp-rg \
  --settings AZURE_DEVOPS_PAT=your-pat-token
```

### 4. Deploy

```bash
npm run build
func azure functionapp publish my-ado-mcp-server
```

### 5. Get Function Key

```bash
az functionapp keys list --name my-ado-mcp-server --resource-group my-ado-mcp-rg
```

### 6. Test Endpoints

```bash
# Health check (no auth)
curl https://my-ado-mcp-server.azurewebsites.net/api/health

# List tools (no auth)
curl https://my-ado-mcp-server.azurewebsites.net/api/tools

# Call MCP endpoint (with function key)
curl -X POST "https://my-ado-mcp-server.azurewebsites.net/api/mcp?code=YOUR_FUNCTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":1}'
```

---

## Remote Bridge: Claude Desktop → Azure Functions

Use the remote bridge to connect Claude Desktop to your hosted Azure Functions instance.

### Configure Claude Desktop

```json
{
  "mcpServers": {
    "azure-devops-remote": {
      "command": "node",
      "args": ["C:\\path\\to\\dami-ado-mcp-server\\dist\\remote-bridge.js"],
      "env": {
        "MCP_REMOTE_URL": "https://my-ado-mcp-server.azurewebsites.net/api/mcp",
        "MCP_FUNCTION_KEY": "your-function-key"
      }
    }
  }
}
```

---

## Authentication Methods

### 1. Interactive Browser (Local)

Best for personal use. Leave `AZURE_DEVOPS_PAT` empty and a browser window will open for login.

### 2. PAT Token (Serverless/Shared)

Required for Azure Functions. Create a PAT at:
`https://dev.azure.com/your-org/_usersSettings/tokens`

Required scopes:
- **Code**: Read & Write
- **Work Items**: Read & Write
- **Build**: Read & Execute
- **Project and Team**: Read
- **Wiki**: Read & Write
- **Test Management**: Read & Write

---

## Available Tools (69)

### Projects & Teams
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `list_project_teams` | List teams in a project |
| `list_team_members` | List team members |

### Work Items
| Tool | Description |
|------|-------------|
| `query_work_items` | Query using WIQL |
| `get_work_items_by_ids` | Get by IDs |
| `create_work_item` | Create new |
| `update_work_item` | Update existing |
| `update_work_items_batch` | Batch update multiple work items |
| `add_child_work_items` | Add children to parent work item |
| `link_work_items` | Link two work items |
| `add_work_item_comment` | Add comment |
| `get_work_item_comments` | Get comments |
| `get_work_item_revisions` | Get history |
| `list_work_item_types` | List types |
| `get_my_work_items` | My items (assigned or created) |
| `get_work_items_for_iteration` | By iteration |
| `list_backlogs` | List backlogs |
| `list_backlog_work_items` | List work items in a backlog |

### Git & Repositories
| Tool | Description |
|------|-------------|
| `list_repositories` | List repos |
| `get_repository` | Get repo details |
| `list_branches` | List branches |
| `get_branch` | Get branch details |
| `create_branch` | Create branch |
| `list_commits` | List commits |
| `search_commits` | Search commits with criteria |
| `get_file_content` | Get file content |

### Pull Requests
| Tool | Description |
|------|-------------|
| `list_pull_requests` | List PRs |
| `get_pull_request` | Get PR details |
| `create_pull_request` | Create PR |
| `update_pull_request` | Update PR |
| `update_pull_request_reviewers` | Set reviewers |
| `list_pull_request_threads` | List threads |
| `create_pull_request_thread` | Create thread |
| `reply_to_pull_request_comment` | Reply to comment |

### Pipelines & Builds
| Tool | Description |
|------|-------------|
| `list_pipelines` | List pipelines |
| `run_pipeline` | Trigger run |
| `get_pipeline_run` | Get run details |
| `list_pipeline_runs` | List runs |
| `get_builds` | List builds |
| `get_build_status` | Get status |
| `get_build_log` | Get logs |
| `list_build_definitions` | List definitions |

### Iterations & Capacity
| Tool | Description |
|------|-------------|
| `list_iterations` | List iterations |
| `create_iterations` | Create iterations |
| `list_team_iterations` | Team iterations |
| `get_team_capacity` | Get capacity |
| `update_team_capacity` | Update capacity |

### Areas
| Tool | Description |
|------|-------------|
| `list_areas` | List areas (classification nodes) |

### Wikis
| Tool | Description |
|------|-------------|
| `list_wikis` | List wikis |
| `get_wiki` | Get wiki details |
| `list_wiki_pages` | List pages |
| `get_wiki_page` | Get page content |
| `create_or_update_wiki_page` | Create/update page |

### Test Plans
| Tool | Description |
|------|-------------|
| `list_test_plans` | List plans |
| `create_test_plan` | Create plan |
| `list_test_suites` | List suites |
| `create_test_suite` | Create suite |
| `list_test_cases` | List cases |
| `create_test_case` | Create case |

### Search
| Tool | Description |
|------|-------------|
| `search_code` | Search code |
| `search_work_items` | Search work items |
| `search_wiki` | Search wiki |

### Identity
| Tool | Description |
|------|-------------|
| `get_identity_ids` | Search for identity IDs |
| `get_current_user` | Get current user |

### Boards & Queries
| Tool | Description |
|------|-------------|
| `list_boards` | List boards for a team |
| `list_queries` | List saved queries |

### Security
| Tool | Description |
|------|-------------|
| `get_advanced_security_alerts` | List alerts |
| `get_advanced_security_alert_details` | Alert details |

---

## API Endpoints (Azure Functions)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | Health check |
| `/api/tools` | GET | None | List available tools |
| `/api/tools/{toolName}` | POST | Function Key | Execute tool |
| `/api/mcp` | POST | Function Key | MCP JSON-RPC endpoint |

### MCP Protocol Examples

```bash
# List tools
curl -X POST "https://YOUR_APP.azurewebsites.net/api/mcp?code=KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST "https://YOUR_APP.azurewebsites.net/api/mcp?code=KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":1}'
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run local MCP server (stdio)
npm start

# Run HTTP server (standalone)
npm run start:http

# Run Azure Functions locally
npm run start:func
```

## License

MIT
