import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureDevOpsClient } from '../azure-devops-client.js';

// Singleton client
let azureClient: AzureDevOpsClient | null = null;

function getClient(): AzureDevOpsClient {
  if (!azureClient) {
    azureClient = new AzureDevOpsClient();
  }
  return azureClient;
}

// Health check function
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    return {
      status: 200,
      jsonBody: { status: 'ok', service: 'azure-devops-mcp-server', version: '1.0.0' },
    };
  },
});

// List tools function
app.http('tools', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tools',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const tools = [
      'list_projects', 'list_project_teams', 'list_team_members',
      'query_work_items', 'get_work_items_by_ids', 'create_work_item', 'update_work_item',
      'list_repositories', 'list_branches', 'list_commits', 'get_file_content',
      'list_pull_requests', 'get_pull_request', 'create_pull_request', 'update_pull_request',
      'get_builds', 'list_build_definitions', 'list_pipelines', 'run_pipeline',
      'list_iterations', 'list_team_iterations', 'list_areas',
      'search_code', 'search_work_items', 'search_wiki',
      'list_wikis', 'get_wiki_page', 'create_or_update_wiki_page',
      'list_test_plans', 'create_test_plan', 'list_test_suites',
      'get_advanced_security_alerts', 'get_advanced_security_alert_details',
    ];
    return {
      status: 200,
      jsonBody: { tools },
    };
  },
});

// Execute tool function
app.http('executeTool', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'tools/{toolName}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const toolName = request.params.toolName;

    try {
      const args = await request.json() as any;
      const client = getClient();
      const result = await executeToolInternal(client, toolName, args);

      return {
        status: 200,
        jsonBody: { success: true, result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`Error executing tool ${toolName}: ${message}`);

      return {
        status: 500,
        jsonBody: { success: false, error: message },
      };
    }
  },
});

// Validate API key from header or query
function validateApiKey(request: HttpRequest): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  if (!expectedKey) {
    // No API key configured, allow all requests (not recommended for production)
    return true;
  }

  // Check header first (preferred)
  const headerKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (headerKey === expectedKey) {
    return true;
  }

  // Fall back to query parameter
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('code') || url.searchParams.get('key');
  return queryKey === expectedKey;
}

// MCP-compatible endpoint (JSON-RPC 2.0)
// Made anonymous to support Claude Desktop remote connector
// Security provided by MCP_API_KEY environment variable
app.http('mcp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'mcp',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Validate API key
    if (!validateApiKey(request)) {
      return {
        status: 401,
        jsonBody: {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unauthorized: Invalid or missing API key' },
          id: null,
        },
      };
    }

    try {
      const body = await request.json() as any;
      const { method, params, id } = body;

      // Handle MCP initialize handshake
      if (method === 'initialize') {
        return {
          status: 200,
          jsonBody: {
            jsonrpc: '2.0',
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: 'azure-devops-mcp-server',
                version: '1.0.0',
              },
            },
            id,
          },
        };
      }

      // Handle notifications (no response needed)
      if (method === 'notifications/initialized') {
        return {
          status: 200,
          jsonBody: { jsonrpc: '2.0', result: {}, id },
        };
      }

      const client = getClient();

      if (method === 'tools/list') {
        const tools = getToolDefinitions();
        return {
          status: 200,
          jsonBody: { jsonrpc: '2.0', result: { tools }, id },
        };
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        const result = await executeToolInternal(client, name, args);
        return {
          status: 200,
          jsonBody: {
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
            id,
          },
        };
      }

      return {
        status: 200,
        jsonBody: {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.error(`MCP error: ${message}`);

      return {
        status: 500,
        jsonBody: {
          jsonrpc: '2.0',
          error: { code: -32603, message },
          id: null,
        },
      };
    }
  },
});

// Tool definitions - All available tools
function getToolDefinitions() {
  return [
    // Projects & Teams
    { name: 'list_projects', description: 'List all projects in the Azure DevOps organization', inputSchema: { type: 'object', properties: {} } },
    { name: 'list_project_teams', description: 'List teams for a project', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or ID' } }, required: ['project'] } },
    { name: 'list_team_members', description: 'List members of a team', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or ID' }, team: { type: 'string', description: 'Team name or ID' } }, required: ['project', 'team'] } },

    // Work Items
    { name: 'query_work_items', description: 'Query work items using WIQL', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or ID' }, wiql: { type: 'string', description: 'WIQL query string' } }, required: ['project', 'wiql'] } },
    { name: 'get_work_items_by_ids', description: 'Get work items by their IDs', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name or ID' }, ids: { type: 'array', items: { type: 'number' }, description: 'Array of work item IDs' } }, required: ['project', 'ids'] } },
    { name: 'create_work_item', description: 'Create a new work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, workItemType: { type: 'string', description: 'Type: Bug, Task, User Story, etc.' }, title: { type: 'string' }, description: { type: 'string' }, additionalFields: { type: 'object' } }, required: ['project', 'workItemType', 'title'] } },
    { name: 'update_work_item', description: 'Update an existing work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, id: { type: 'number' }, fields: { type: 'object', description: 'Fields to update' }, comment: { type: 'string' } }, required: ['project', 'id', 'fields'] } },
    { name: 'update_work_items_batch', description: 'Update multiple work items in batch', inputSchema: { type: 'object', properties: { project: { type: 'string' }, updates: { type: 'array', description: 'Array of updates' } }, required: ['project', 'updates'] } },
    { name: 'add_child_work_items', description: 'Add child work items to a parent', inputSchema: { type: 'object', properties: { project: { type: 'string' }, parentId: { type: 'number' }, childIds: { type: 'array', items: { type: 'number' } } }, required: ['project', 'parentId', 'childIds'] } },
    { name: 'link_work_items', description: 'Link two work items', inputSchema: { type: 'object', properties: { project: { type: 'string' }, sourceId: { type: 'number' }, targetId: { type: 'number' }, linkType: { type: 'string' } }, required: ['project', 'sourceId', 'targetId'] } },
    { name: 'unlink_work_item', description: 'Remove a link from a work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, workItemId: { type: 'number' }, relationId: { type: 'string' } }, required: ['project', 'workItemId', 'relationId'] } },
    { name: 'add_work_item_comment', description: 'Add a comment to a work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, workItemId: { type: 'number' }, text: { type: 'string' } }, required: ['project', 'workItemId', 'text'] } },
    { name: 'get_work_item_comments', description: 'Get comments for a work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, id: { type: 'number' } }, required: ['project', 'id'] } },
    { name: 'get_work_item_revisions', description: 'Get revision history for a work item', inputSchema: { type: 'object', properties: { project: { type: 'string' }, id: { type: 'number' } }, required: ['project', 'id'] } },
    { name: 'list_work_item_types', description: 'List available work item types', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'get_my_work_items', description: 'Get work items assigned to or created by current user', inputSchema: { type: 'object', properties: { project: { type: 'string' }, assignedToMe: { type: 'boolean', description: 'True for assigned, false for created' } }, required: ['project'] } },
    { name: 'get_work_items_for_iteration', description: 'Get work items for a specific iteration', inputSchema: { type: 'object', properties: { project: { type: 'string' }, iterationPath: { type: 'string' } }, required: ['project', 'iterationPath'] } },
    { name: 'list_backlogs', description: 'List backlogs for a team', inputSchema: { type: 'object', properties: { project: { type: 'string' }, team: { type: 'string' } }, required: ['project', 'team'] } },
    { name: 'list_backlog_work_items', description: 'List work items in a backlog', inputSchema: { type: 'object', properties: { project: { type: 'string' }, team: { type: 'string' }, backlogId: { type: 'string' } }, required: ['project', 'team', 'backlogId'] } },
    { name: 'get_query_results', description: 'Execute a saved query', inputSchema: { type: 'object', properties: { project: { type: 'string' }, queryId: { type: 'string' } }, required: ['project', 'queryId'] } },

    // Repositories
    { name: 'list_repositories', description: 'List Git repositories in a project', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'get_repository', description: 'Get repository details', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' } }, required: ['project', 'repositoryId'] } },
    { name: 'list_branches', description: 'List branches in a repository', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' } }, required: ['project', 'repositoryId'] } },
    { name: 'get_branch', description: 'Get branch details', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, branchName: { type: 'string' } }, required: ['project', 'repositoryId', 'branchName'] } },
    { name: 'create_branch', description: 'Create a new branch', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, name: { type: 'string' }, sourceBranch: { type: 'string' } }, required: ['project', 'repositoryId', 'name', 'sourceBranch'] } },
    { name: 'list_commits', description: 'List commits in a repository', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, top: { type: 'number' } }, required: ['project', 'repositoryId'] } },
    { name: 'search_commits', description: 'Search commits with criteria', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, searchCriteria: { type: 'object' }, top: { type: 'number' } }, required: ['project', 'repositoryId', 'searchCriteria'] } },
    { name: 'get_file_content', description: 'Get file content from repository', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, path: { type: 'string' } }, required: ['project', 'repositoryId', 'path'] } },

    // Pull Requests
    { name: 'list_pull_requests', description: 'List pull requests', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, status: { type: 'string', description: 'active, completed, abandoned' }, top: { type: 'number' } }, required: ['project'] } },
    { name: 'get_pull_request', description: 'Get pull request details', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' } }, required: ['project', 'repositoryId', 'pullRequestId'] } },
    { name: 'create_pull_request', description: 'Create a new pull request', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, sourceBranch: { type: 'string' }, targetBranch: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } }, required: ['project', 'repositoryId', 'sourceBranch', 'targetBranch', 'title'] } },
    { name: 'update_pull_request', description: 'Update a pull request', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' }, updates: { type: 'object' } }, required: ['project', 'repositoryId', 'pullRequestId', 'updates'] } },
    { name: 'update_pull_request_reviewers', description: 'Update PR reviewers', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' }, reviewers: { type: 'array' } }, required: ['project', 'repositoryId', 'pullRequestId', 'reviewers'] } },
    { name: 'list_pull_request_threads', description: 'List PR comment threads', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' } }, required: ['project', 'repositoryId', 'pullRequestId'] } },
    { name: 'create_pull_request_thread', description: 'Create a comment thread on PR', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' }, thread: { type: 'object' } }, required: ['project', 'repositoryId', 'pullRequestId', 'thread'] } },
    { name: 'reply_to_pull_request_comment', description: 'Reply to a PR comment', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, pullRequestId: { type: 'number' }, threadId: { type: 'number' }, comment: { type: 'object' } }, required: ['project', 'repositoryId', 'pullRequestId', 'threadId', 'comment'] } },

    // Builds & Pipelines
    { name: 'get_builds', description: 'List builds', inputSchema: { type: 'object', properties: { project: { type: 'string' }, definitionId: { type: 'number' }, top: { type: 'number' } }, required: ['project'] } },
    { name: 'get_build_status', description: 'Get build status', inputSchema: { type: 'object', properties: { project: { type: 'string' }, buildId: { type: 'number' } }, required: ['project', 'buildId'] } },
    { name: 'get_build_log', description: 'Get build logs', inputSchema: { type: 'object', properties: { project: { type: 'string' }, buildId: { type: 'number' } }, required: ['project', 'buildId'] } },
    { name: 'list_build_definitions', description: 'List build definitions', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'list_pipelines', description: 'List pipelines', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'run_pipeline', description: 'Trigger a pipeline run', inputSchema: { type: 'object', properties: { project: { type: 'string' }, pipelineId: { type: 'number' }, parameters: { type: 'object' } }, required: ['project', 'pipelineId'] } },
    { name: 'get_pipeline_run', description: 'Get pipeline run details', inputSchema: { type: 'object', properties: { project: { type: 'string' }, pipelineId: { type: 'number' }, runId: { type: 'number' } }, required: ['project', 'pipelineId', 'runId'] } },
    { name: 'list_pipeline_runs', description: 'List pipeline runs', inputSchema: { type: 'object', properties: { project: { type: 'string' }, pipelineId: { type: 'number' }, top: { type: 'number' } }, required: ['project', 'pipelineId'] } },

    // Iterations & Areas
    { name: 'list_iterations', description: 'List project iterations', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'list_team_iterations', description: 'List team iterations', inputSchema: { type: 'object', properties: { project: { type: 'string' }, team: { type: 'string' } }, required: ['project', 'team'] } },
    { name: 'list_areas', description: 'List project areas', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'get_team_capacity', description: 'Get team capacity for an iteration', inputSchema: { type: 'object', properties: { project: { type: 'string' }, team: { type: 'string' }, iterationId: { type: 'string' } }, required: ['project', 'team', 'iterationId'] } },

    // Search
    { name: 'search_code', description: 'Search code across repositories', inputSchema: { type: 'object', properties: { searchText: { type: 'string' }, project: { type: 'string' }, repository: { type: 'string' }, top: { type: 'number' } }, required: ['searchText'] } },
    { name: 'search_work_items', description: 'Search work items', inputSchema: { type: 'object', properties: { searchText: { type: 'string' }, project: { type: 'string' }, top: { type: 'number' } }, required: ['searchText'] } },
    { name: 'search_wiki', description: 'Search wiki pages', inputSchema: { type: 'object', properties: { searchText: { type: 'string' }, project: { type: 'string' }, wikiIdentifier: { type: 'string' }, top: { type: 'number' } }, required: ['searchText'] } },

    // Identity
    { name: 'get_identity_ids', description: 'Search for user identities', inputSchema: { type: 'object', properties: { searchFilter: { type: 'string' } }, required: ['searchFilter'] } },
    { name: 'get_current_user', description: 'Get current authenticated user info', inputSchema: { type: 'object', properties: {} } },

    // Boards & Queries
    { name: 'list_boards', description: 'List team boards', inputSchema: { type: 'object', properties: { project: { type: 'string' }, team: { type: 'string' } }, required: ['project', 'team'] } },
    { name: 'list_queries', description: 'List saved queries', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },

    // Wikis
    { name: 'list_wikis', description: 'List wikis in a project', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'get_wiki', description: 'Get wiki details', inputSchema: { type: 'object', properties: { project: { type: 'string' }, wikiIdentifier: { type: 'string' } }, required: ['project', 'wikiIdentifier'] } },
    { name: 'list_wiki_pages', description: 'List wiki pages', inputSchema: { type: 'object', properties: { project: { type: 'string' }, wikiIdentifier: { type: 'string' }, path: { type: 'string' } }, required: ['project', 'wikiIdentifier'] } },
    { name: 'get_wiki_page', description: 'Get wiki page content', inputSchema: { type: 'object', properties: { project: { type: 'string' }, wikiIdentifier: { type: 'string' }, path: { type: 'string' } }, required: ['project', 'wikiIdentifier'] } },
    { name: 'create_or_update_wiki_page', description: 'Create or update a wiki page', inputSchema: { type: 'object', properties: { project: { type: 'string' }, wikiIdentifier: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, comment: { type: 'string' } }, required: ['project', 'wikiIdentifier', 'path', 'content'] } },

    // Test Plans
    { name: 'list_test_plans', description: 'List test plans', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
    { name: 'create_test_plan', description: 'Create a test plan', inputSchema: { type: 'object', properties: { project: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['project', 'name'] } },
    { name: 'list_test_suites', description: 'List test suites in a plan', inputSchema: { type: 'object', properties: { project: { type: 'string' }, planId: { type: 'number' } }, required: ['project', 'planId'] } },
    { name: 'list_test_cases', description: 'List test cases in a suite', inputSchema: { type: 'object', properties: { project: { type: 'string' }, planId: { type: 'number' }, suiteId: { type: 'number' } }, required: ['project', 'planId', 'suiteId'] } },

    // Advanced Security
    { name: 'get_advanced_security_alerts', description: 'Get security alerts for a repository', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, severity: { type: 'string' }, state: { type: 'string' }, top: { type: 'number' } }, required: ['project', 'repositoryId'] } },
    { name: 'get_advanced_security_alert_details', description: 'Get details of a security alert', inputSchema: { type: 'object', properties: { project: { type: 'string' }, repositoryId: { type: 'string' }, alertId: { type: 'string' } }, required: ['project', 'repositoryId', 'alertId'] } },
  ];
}

// Tool execution
async function executeToolInternal(client: AzureDevOpsClient, toolName: string, args: any): Promise<any> {
  switch (toolName) {
    // Projects
    case 'list_projects':
      return client.getProjects();
    case 'list_project_teams':
      return client.getTeams(args.project, args.mine, args.top);
    case 'list_team_members':
      return client.getTeamMembers(args.project, args.team);

    // Work Items
    case 'query_work_items':
      return client.queryWorkItems(args.wiql, args.project);
    case 'get_work_items_by_ids':
      return client.getWorkItems(args.ids, args.project);
    case 'create_work_item':
      return client.createWorkItem(args.project, args.workItemType, args.title, args.description, args.additionalFields);
    case 'update_work_item':
      return client.updateWorkItem(args.project, args.id, args.fields, args.comment);
    case 'update_work_items_batch':
      return client.updateWorkItemsBatch(args.project, args.updates);
    case 'add_child_work_items':
      return client.addChildWorkItems(args.project, args.parentId, args.childIds);
    case 'link_work_items':
      return client.linkWorkItems(args.project, args.sourceId, args.targetId, args.linkType);
    case 'unlink_work_item':
      return client.unlinkWorkItem(args.project, args.workItemId, args.relationId);
    case 'add_artifact_link':
      return client.addArtifactLink(args.project, args.workItemId, args.artifactUri, args.artifactType);
    case 'link_work_item_to_pull_request':
      return client.linkWorkItemToPullRequest(args.project, args.workItemId, args.repositoryId, args.pullRequestId);
    case 'add_work_item_comment':
      return client.addWorkItemComment(args.project, args.workItemId, args.text);
    case 'get_work_item_comments':
      return client.getWorkItemComments(args.project, args.id);
    case 'get_work_item_revisions':
      return client.getWorkItemRevisions(args.project, args.id);
    case 'list_work_item_types':
      return client.getWorkItemTypes(args.project);
    case 'get_my_work_items':
      return client.getMyWorkItems(args.project, args.assignedToMe);
    case 'get_work_items_for_iteration':
      return client.getWorkItemsForIteration(args.project, args.iterationPath);
    case 'list_backlogs':
      return client.listBacklogs(args.project, args.team);
    case 'list_backlog_work_items':
      return client.listBacklogWorkItems(args.project, args.team, args.backlogId);
    case 'get_query_results':
      return client.getQueryResults(args.project, args.queryId);

    // Repositories
    case 'list_repositories':
      return client.getRepositories(args.project);
    case 'get_repository':
      return client.getRepositoryById(args.project, args.repositoryId);
    case 'list_branches':
      return client.getBranches(args.project, args.repositoryId);
    case 'get_my_branches':
      return client.getMyBranches(args.project, args.repositoryId);
    case 'get_branch':
      return client.getBranchByName(args.project, args.repositoryId, args.branchName);
    case 'create_branch':
      return client.createBranch(args.project, args.repositoryId, args.name, args.sourceBranch);
    case 'list_commits':
      return client.getCommits(args.project, args.repositoryId, args.top);
    case 'search_commits':
      return client.searchCommits(args.project, args.repositoryId, args.searchCriteria, args.top);
    case 'get_file_content':
      return client.getFileContent(args.project, args.repositoryId, args.path);

    // Pull Requests
    case 'list_pull_requests':
      return client.getPullRequests(args.project, args.repositoryId, args.top, args.status);
    case 'list_pull_requests_by_commits':
      return client.listPullRequestsByCommits(args.project, args.repositoryId, args.commitIds);
    case 'get_pull_request':
      return client.getPullRequestById(args.project, args.repositoryId, args.pullRequestId);
    case 'create_pull_request':
      return client.createPullRequest(args.project, args.repositoryId, args.sourceBranch, args.targetBranch, args.title, args.description);
    case 'update_pull_request':
      return client.updatePullRequest(args.project, args.repositoryId, args.pullRequestId, args.updates);
    case 'update_pull_request_reviewers':
      return client.updatePullRequestReviewers(args.project, args.repositoryId, args.pullRequestId, args.reviewers);
    case 'list_pull_request_threads':
      return client.listPullRequestThreads(args.project, args.repositoryId, args.pullRequestId);
    case 'list_pull_request_thread_comments':
      return client.listPullRequestThreadComments(args.project, args.repositoryId, args.pullRequestId, args.threadId);
    case 'create_pull_request_thread':
      return client.createPullRequestThread(args.project, args.repositoryId, args.pullRequestId, args.thread);
    case 'update_pull_request_thread':
      return client.updatePullRequestThread(args.project, args.repositoryId, args.pullRequestId, args.threadId, args.updates);
    case 'reply_to_pull_request_comment':
      return client.replyToPullRequestComment(args.project, args.repositoryId, args.pullRequestId, args.threadId, args.comment);

    // Builds/Pipelines
    case 'get_builds':
      return client.getBuilds(args.project, args.definitionId, args.top);
    case 'get_build_status':
      return client.getBuildStatus(args.project, args.buildId);
    case 'get_build_log':
      return client.getBuildLog(args.project, args.buildId);
    case 'get_build_log_by_id':
      return client.getBuildLogById(args.project, args.buildId, args.logId);
    case 'get_build_changes':
      return client.getBuildChanges(args.project, args.buildId);
    case 'list_build_definitions':
      return client.getBuildDefinitions(args.project);
    case 'get_build_definition_revisions':
      return client.getBuildDefinitionRevisions(args.project, args.definitionId);
    case 'list_pipelines':
      return client.getPipelines(args.project);
    case 'create_pipeline':
      return client.createPipeline(args.project, args.name, args.configuration);
    case 'run_pipeline':
      return client.runPipeline(args.project, args.pipelineId, args.parameters);
    case 'get_pipeline_run':
      return client.getPipelineRun(args.project, args.pipelineId, args.runId);
    case 'list_pipeline_runs':
      return client.listPipelineRuns(args.project, args.pipelineId, args.top);
    case 'update_build_stage':
      return client.updateBuildStage(args.project, args.buildId, args.stageRefName, args.state);

    // Iterations
    case 'list_iterations':
      return client.getIterations(args.project);
    case 'create_iterations':
      return client.createIterations(args.project, args.iterations);
    case 'list_team_iterations':
      return client.getTeamIterations(args.project, args.team);
    case 'assign_iterations':
      return client.assignIterations(args.project, args.team, args.iterationIds);
    case 'get_iteration_capacities':
      return client.getIterationCapacities(args.project, args.iterationId);
    case 'get_team_capacity':
      return client.getTeamCapacity(args.project, args.team, args.iterationId);
    case 'update_team_capacity':
      return client.updateTeamCapacity(args.project, args.team, args.iterationId, args.capacities);

    // Areas
    case 'list_areas':
      return client.getAreas(args.project);

    // Search
    case 'search_code':
      return client.searchCode(args.searchText, args.project, args.repository, args.top);
    case 'search_work_items':
      return client.searchWorkItems(args.searchText, args.project, args.top);
    case 'search_wiki':
      return client.searchWiki(args.searchText, args.project, args.wikiIdentifier, args.top);

    // Identity
    case 'get_identity_ids':
      return client.searchIdentities(args.searchFilter);
    case 'get_current_user':
      return client.getCurrentUser();

    // Boards
    case 'list_boards':
      return client.getBoards(args.project, args.team);

    // Queries
    case 'list_queries':
      return client.getQueries(args.project);

    // Wikis
    case 'list_wikis':
      return client.getWikis(args.project);
    case 'get_wiki':
      return client.getWiki(args.project, args.wikiIdentifier);
    case 'list_wiki_pages':
      return client.listWikiPages(args.project, args.wikiIdentifier, args.path);
    case 'get_wiki_page':
      return client.getWikiPageContent(args.project, args.wikiIdentifier, args.path);
    case 'create_or_update_wiki_page':
      return client.createOrUpdateWikiPage(args.project, args.wikiIdentifier, args.path, args.content, args.comment);

    // Test Plans
    case 'list_test_plans':
      return client.getTestPlans(args.project);
    case 'create_test_plan':
      return client.createTestPlan(args.project, args.name, args.description);
    case 'list_test_suites':
      return client.listTestSuites(args.project, args.planId);
    case 'create_test_suite':
      return client.createTestSuite(args.project, args.planId, args.name, args.suiteType);
    case 'add_test_cases_to_suite':
      return client.addTestCasesToSuite(args.project, args.planId, args.suiteId, args.testCaseIds);
    case 'list_test_cases':
      return client.listTestCases(args.project, args.planId, args.suiteId);
    case 'create_test_case':
      return client.createTestCase(args.project, args.title, args.steps);
    case 'update_test_case_steps':
      return client.updateTestCaseSteps(args.project, args.testCaseId, args.steps);
    case 'get_test_results_from_build':
      return client.getTestResultsFromBuild(args.project, args.buildId);

    // Advanced Security
    case 'get_advanced_security_alerts':
      return client.getAdvancedSecurityAlerts(args.project, args.repositoryId, args.severity, args.state, args.top);
    case 'get_advanced_security_alert_details':
      return client.getAdvancedSecurityAlertDetails(args.project, args.repositoryId, args.alertId);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
