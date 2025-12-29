#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { AzureDevOpsClient } from './azure-devops-client.js';
import dotenv from 'dotenv';

dotenv.config();

// Create MCP server
const server = new Server(
  {
    name: 'dami-ado-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const azureClient = new AzureDevOpsClient();

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects in the Azure DevOps organization',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_project_teams',
    description: 'List teams for a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        mine: {
          type: 'boolean',
          description: 'If true, only return teams the authenticated user is a member of',
        },
        top: {
          type: 'number',
          description: 'Maximum number of teams to return (default 100)',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_team_members',
    description: 'List members of a team',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        team: {
          type: 'string',
          description: 'Team name or ID',
        },
      },
      required: ['project', 'team'],
    },
  },
  {
    name: 'query_work_items',
    description: 'Query work items using WIQL (Work Item Query Language)',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        wiql: {
          type: 'string',
          description: 'WIQL query string, e.g., SELECT [System.Id] FROM WorkItems WHERE [System.State] = \'Active\'',
        },
      },
      required: ['project', 'wiql'],
    },
  },
  {
    name: 'get_work_items_by_ids',
    description: 'Get work items by their IDs',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of work item IDs',
        },
      },
      required: ['project', 'ids'],
    },
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        workItemType: {
          type: 'string',
          description: 'Work item type (e.g., Bug, Task, User Story, Issue)',
        },
        title: {
          type: 'string',
          description: 'Title of the work item',
        },
        description: {
          type: 'string',
          description: 'Optional description',
        },
        additionalFields: {
          type: 'object',
          description: 'Additional fields as key-value pairs',
        },
      },
      required: ['project', 'workItemType', 'title'],
    },
  },
  {
    name: 'update_work_item',
    description: 'Update fields of an existing work item',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        id: {
          type: 'number',
          description: 'Work item ID',
        },
        fields: {
          type: 'object',
          description: 'Fields to update as key-value pairs (e.g., {"System.Description": "new description"})',
        },
        comment: {
          type: 'string',
          description: 'Optional comment for history',
        },
      },
      required: ['project', 'id', 'fields'],
    },
  },
  {
    name: 'list_work_item_types',
    description: 'List work item types available in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_repositories',
    description: 'List Git repositories in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_branches',
    description: 'List branches in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Repository ID or name',
        },
      },
      required: ['project', 'repositoryId'],
    },
  },
  {
    name: 'list_commits',
    description: 'List commits in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Repository ID or name',
        },
        top: {
          type: 'number',
          description: 'Number of commits to retrieve (default 10)',
        },
      },
      required: ['project', 'repositoryId'],
    },
  },
  {
    name: 'get_file_content',
    description: 'Get content of a file in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Repository ID or name',
        },
        path: {
          type: 'string',
          description: 'File path within repository',
        },
      },
      required: ['project', 'repositoryId', 'path'],
    },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Optional repository ID to filter',
        },
        status: {
          type: 'string',
          description: 'PR status: active, completed, abandoned (default active)',
        },
        top: {
          type: 'number',
          description: 'Number of PRs to retrieve (default 100)',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_pull_request',
    description: 'Get details of a specific pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Repository ID or name',
        },
        pullRequestId: {
          type: 'number',
          description: 'Pull request ID',
        },
      },
      required: ['project', 'repositoryId', 'pullRequestId'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'Create a new pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        repositoryId: {
          type: 'string',
          description: 'Repository ID or name',
        },
        sourceBranch: {
          type: 'string',
          description: 'Source branch name (without refs/heads/)',
        },
        targetBranch: {
          type: 'string',
          description: 'Target branch name (without refs/heads/)',
        },
        title: {
          type: 'string',
          description: 'Pull request title',
        },
        description: {
          type: 'string',
          description: 'Optional description',
        },
      },
      required: ['project', 'repositoryId', 'sourceBranch', 'targetBranch', 'title'],
    },
  },
  {
    name: 'get_builds',
    description: 'Get recent builds for a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        definitionId: {
          type: 'number',
          description: 'Optional build definition ID to filter',
        },
        top: {
          type: 'number',
          description: 'Number of builds to retrieve (default 10)',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_build_definitions',
    description: 'List build definitions (pipelines) for a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_pipelines',
    description: 'List YAML pipelines in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_iterations',
    description: 'List iterations (sprints) for a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'list_team_iterations',
    description: 'List iterations for a team',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        team: {
          type: 'string',
          description: 'Team name or ID',
        },
      },
      required: ['project', 'team'],
    },
  },
  {
    name: 'list_areas',
    description: 'List areas (classification nodes) in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for code across repositories',
    inputSchema: {
      type: 'object',
      properties: {
        searchText: {
          type: 'string',
          description: 'Search text',
        },
        project: {
          type: 'string',
          description: 'Optional project to filter',
        },
        repository: {
          type: 'string',
          description: 'Optional repository to filter',
        },
        top: {
          type: 'number',
          description: 'Number of results (default 10)',
        },
      },
      required: ['searchText'],
    },
  },
  {
    name: 'search_work_items',
    description: 'Search for work items using text search',
    inputSchema: {
      type: 'object',
      properties: {
        searchText: {
          type: 'string',
          description: 'Search text',
        },
        project: {
          type: 'string',
          description: 'Optional project to filter',
        },
        top: {
          type: 'number',
          description: 'Number of results (default 10)',
        },
      },
      required: ['searchText'],
    },
  },
  {
    name: 'get_identity_ids',
    description: 'Search for Azure DevOps identity IDs',
    inputSchema: {
      type: 'object',
      properties: {
        searchFilter: {
          type: 'string',
          description: 'Search filter (name, email, etc.)',
        },
      },
      required: ['searchFilter'],
    },
  },
  {
    name: 'get_current_user',
    description: 'Get the currently authenticated user details',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_boards',
    description: 'List boards for a team',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        team: {
          type: 'string',
          description: 'Team name or ID',
        },
      },
      required: ['project', 'team'],
    },
  },
  {
    name: 'list_queries',
    description: 'List saved work item queries',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_work_item_revisions',
    description: 'Get revision history of a work item',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        id: {
          type: 'number',
          description: 'Work item ID',
        },
      },
      required: ['project', 'id'],
    },
  },
  {
    name: 'get_work_item_comments',
    description: 'Get comments for a work item',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        id: {
          type: 'number',
          description: 'Work item ID',
        },
      },
      required: ['project', 'id'],
    },
  },
  {
    name: 'list_wikis',
    description: 'List wikis in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_wiki_page',
    description: 'Get content of a wiki page',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
        wikiIdentifier: {
          type: 'string',
          description: 'Wiki identifier (ID or name)',
        },
        path: {
          type: 'string',
          description: 'Wiki page path (default "/")',
        },
      },
      required: ['project', 'wikiIdentifier'],
    },
  },
  {
    name: 'list_test_plans',
    description: 'List test plans in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name or ID',
        },
      },
      required: ['project'],
    },
  },
];

// Handle ListTools request
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle CallTool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const projects = await azureClient.getProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      }

      case 'list_project_teams': {
        const project = args?.project as string;
        const mine = args?.mine as boolean | undefined;
        const top = args?.top as number | undefined;
        const teams = await azureClient.getTeams(project, mine, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(teams, null, 2),
            },
          ],
        };
      }

      case 'list_team_members': {
        const project = args?.project as string;
        const team = args?.team as string;
        const members = await azureClient.getTeamMembers(project, team);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(members, null, 2),
            },
          ],
        };
      }

      case 'query_work_items': {
        const project = args?.project as string;
        const wiql = args?.wiql as string;
        const workItems = await azureClient.queryWorkItems(wiql, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItems, null, 2),
            },
          ],
        };
      }

      case 'get_work_items_by_ids': {
        const project = args?.project as string;
        const ids = args?.ids as number[];
        const workItems = await azureClient.getWorkItems(ids, project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItems, null, 2),
            },
          ],
        };
      }

      case 'create_work_item': {
        const project = args?.project as string;
        const workItemType = args?.workItemType as string;
        const title = args?.title as string;
        const description = args?.description as string | undefined;
        const additionalFields = args?.additionalFields as Record<string, any> | undefined;
        const workItem = await azureClient.createWorkItem(
          project,
          workItemType,
          title,
          description,
          additionalFields
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItem, null, 2),
            },
          ],
        };
      }

      case 'update_work_item': {
        const project = args?.project as string;
        const id = args?.id as number;
        const fields = args?.fields as Record<string, any>;
        const comment = args?.comment as string | undefined;
        const workItem = await azureClient.updateWorkItem(project, id, fields, comment);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItem, null, 2),
            },
          ],
        };
      }

      case 'list_work_item_types': {
        const project = args?.project as string;
        const types = await azureClient.getWorkItemTypes(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(types, null, 2),
            },
          ],
        };
      }

      case 'list_repositories': {
        const project = args?.project as string;
        const repos = await azureClient.getRepositories(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(repos, null, 2),
            },
          ],
        };
      }

      case 'list_branches': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const branches = await azureClient.getBranches(project, repositoryId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(branches, null, 2),
            },
          ],
        };
      }

      case 'list_commits': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const top = (args?.top as number) || 10;
        const commits = await azureClient.getCommits(project, repositoryId, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(commits, null, 2),
            },
          ],
        };
      }

      case 'get_file_content': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const path = args?.path as string;
        const content = await azureClient.getFileContent(project, repositoryId, path);
        return {
          content: [
            {
              type: 'text',
              text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
            },
          ],
        };
      }

      case 'list_pull_requests': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string | undefined;
        const status = (args?.status as string) || 'active';
        const top = (args?.top as number) || 100;
        const prs = await azureClient.getPullRequests(project, repositoryId, top, status);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(prs, null, 2),
            },
          ],
        };
      }

      case 'get_pull_request': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const pr = await azureClient.getPullRequestById(project, repositoryId, pullRequestId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(pr, null, 2),
            },
          ],
        };
      }

      case 'create_pull_request': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const sourceBranch = args?.sourceBranch as string;
        const targetBranch = args?.targetBranch as string;
        const title = args?.title as string;
        const description = args?.description as string | undefined;
        const pr = await azureClient.createPullRequest(
          project,
          repositoryId,
          sourceBranch,
          targetBranch,
          title,
          description
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(pr, null, 2),
            },
          ],
        };
      }

      case 'get_builds': {
        const project = args?.project as string;
        const definitionId = args?.definitionId as number | undefined;
        const top = (args?.top as number) || 10;
        const builds = await azureClient.getBuilds(project, definitionId, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(builds, null, 2),
            },
          ],
        };
      }

      case 'list_build_definitions': {
        const project = args?.project as string;
        const definitions = await azureClient.getBuildDefinitions(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(definitions, null, 2),
            },
          ],
        };
      }

      case 'list_pipelines': {
        const project = args?.project as string;
        const pipelines = await azureClient.getPipelines(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(pipelines, null, 2),
            },
          ],
        };
      }

      case 'list_iterations': {
        const project = args?.project as string;
        const iterations = await azureClient.getIterations(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(iterations, null, 2),
            },
          ],
        };
      }

      case 'list_team_iterations': {
        const project = args?.project as string;
        const team = args?.team as string;
        const iterations = await azureClient.getTeamIterations(project, team);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(iterations, null, 2),
            },
          ],
        };
      }

      case 'list_areas': {
        const project = args?.project as string;
        const areas = await azureClient.getAreas(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(areas, null, 2),
            },
          ],
        };
      }

      case 'search_code': {
        const searchText = args?.searchText as string;
        const project = args?.project as string | undefined;
        const repository = args?.repository as string | undefined;
        const top = (args?.top as number) || 10;
        const results = await azureClient.searchCode(searchText, project, repository, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'search_work_items': {
        const searchText = args?.searchText as string;
        const project = args?.project as string | undefined;
        const top = (args?.top as number) || 10;
        const results = await azureClient.searchWorkItems(searchText, project, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_identity_ids': {
        const searchFilter = args?.searchFilter as string;
        const identities = await azureClient.searchIdentities(searchFilter);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(identities, null, 2),
            },
          ],
        };
      }

      case 'get_current_user': {
        const user = await azureClient.getCurrentUser();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(user, null, 2),
            },
          ],
        };
      }

      case 'list_boards': {
        const project = args?.project as string;
        const team = args?.team as string;
        const boards = await azureClient.getBoards(project, team);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(boards, null, 2),
            },
          ],
        };
      }

      case 'list_queries': {
        const project = args?.project as string;
        const queries = await azureClient.getQueries(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(queries, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_revisions': {
        const project = args?.project as string;
        const id = args?.id as number;
        const revisions = await azureClient.getWorkItemRevisions(project, id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(revisions, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_comments': {
        const project = args?.project as string;
        const id = args?.id as number;
        const comments = await azureClient.getWorkItemComments(project, id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(comments, null, 2),
            },
          ],
        };
      }

      case 'list_wikis': {
        const project = args?.project as string;
        const wikis = await azureClient.getWikis(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(wikis, null, 2),
            },
          ],
        };
      }

      case 'get_wiki_page': {
        const project = args?.project as string;
        const wikiIdentifier = args?.wikiIdentifier as string;
        const path = (args?.path as string) || '/';
        const content = await azureClient.getWikiPageContent(project, wikiIdentifier, path);
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      case 'list_test_plans': {
        const project = args?.project as string;
        const testPlans = await azureClient.getTestPlans(project);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(testPlans, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Main function
async function main() {
  console.error('Starting Dami Azure DevOps MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Dami Azure DevOps MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
