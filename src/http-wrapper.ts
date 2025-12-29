#!/usr/bin/env node
/**
 * HTTP Wrapper for Azure DevOps MCP Server
 * This can be deployed to Azure Functions or run as a standalone Express server
 */

import express, { Request, Response } from 'express';
import { AzureDevOpsClient } from './azure-devops-client.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Create Azure DevOps client
let azureClient: AzureDevOpsClient | null = null;

function getClient(): AzureDevOpsClient {
  if (!azureClient) {
    azureClient = new AzureDevOpsClient();
  }
  return azureClient;
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'azure-devops-mcp-server', version: '1.0.0' });
});

// List available tools
app.get('/api/tools', (req: Request, res: Response) => {
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
  res.json({ tools });
});

// Generic tool execution endpoint
app.post('/api/tools/:toolName', async (req: Request, res: Response) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    const client = getClient();
    const result = await executeToolInternal(client, toolName, args);
    res.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

// MCP-compatible endpoint (JSON-RPC 2.0)
app.post('/api/mcp', async (req: Request, res: Response) => {
  const { method, params, id } = req.body;

  try {
    const client = getClient();

    if (method === 'tools/list') {
      const tools = getToolDefinitions();
      res.json({ jsonrpc: '2.0', result: { tools }, id });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const result = await executeToolInternal(client, name, args);
      res.json({
        jsonrpc: '2.0',
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
        id,
      });
      return;
    }

    res.json({
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: ${method}` },
      id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message },
      id,
    });
  }
});

// Tool definitions for MCP
function getToolDefinitions() {
  return [
    {
      name: 'list_projects',
      description: 'List all projects in the Azure DevOps organization',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_project_teams',
      description: 'List teams for a project',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name or ID' },
        },
        required: ['project'],
      },
    },
    {
      name: 'query_work_items',
      description: 'Query work items using WIQL',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name or ID' },
          wiql: { type: 'string', description: 'WIQL query string' },
        },
        required: ['project', 'wiql'],
      },
    },
    {
      name: 'list_repositories',
      description: 'List Git repositories in a project',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name or ID' },
        },
        required: ['project'],
      },
    },
    {
      name: 'list_pull_requests',
      description: 'List pull requests in a project',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name or ID' },
          repositoryId: { type: 'string', description: 'Optional repository ID' },
          status: { type: 'string', description: 'PR status: active, completed, abandoned' },
        },
        required: ['project'],
      },
    },
    // Add more tool definitions as needed
  ];
}

// Internal tool execution
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

// Export for Azure Functions
export { app, executeToolInternal, getClient };

// Start server if running standalone
if (process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development' && process.env.FUNCTIONS_WORKER_RUNTIME !== 'node') {
  app.listen(port, () => {
    console.log(`Azure DevOps MCP HTTP Server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Tools list: http://localhost:${port}/api/tools`);
    console.log(`MCP endpoint: POST http://localhost:${port}/api/mcp`);
  });
}
