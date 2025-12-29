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
  {
    name: 'get_repository',
    description: 'Get details of a specific repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
      },
      required: ['project', 'repositoryId'],
    },
  },
  {
    name: 'get_branch',
    description: 'Get details of a specific branch',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        branchName: { type: 'string', description: 'Branch name (without refs/heads/)' },
      },
      required: ['project', 'repositoryId', 'branchName'],
    },
  },
  {
    name: 'create_branch',
    description: 'Create a new branch in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        name: { type: 'string', description: 'New branch name' },
        sourceBranch: { type: 'string', description: 'Source branch name to branch from' },
      },
      required: ['project', 'repositoryId', 'name', 'sourceBranch'],
    },
  },
  {
    name: 'search_commits',
    description: 'Search commits with criteria',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        searchCriteria: { type: 'object', description: 'Search criteria object' },
        top: { type: 'number', description: 'Number of commits (default 100)' },
      },
      required: ['project', 'repositoryId', 'searchCriteria'],
    },
  },
  {
    name: 'update_work_items_batch',
    description: 'Update multiple work items in a batch',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        updates: { type: 'array', description: 'Array of update operations' },
      },
      required: ['project', 'updates'],
    },
  },
  {
    name: 'add_child_work_items',
    description: 'Add child work items to a parent',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        parentId: { type: 'number', description: 'Parent work item ID' },
        childIds: { type: 'array', items: { type: 'number' }, description: 'Child work item IDs' },
      },
      required: ['project', 'parentId', 'childIds'],
    },
  },
  {
    name: 'link_work_items',
    description: 'Link two work items together',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        sourceId: { type: 'number', description: 'Source work item ID' },
        targetId: { type: 'number', description: 'Target work item ID' },
        linkType: { type: 'string', description: 'Link type (default: System.LinkTypes.Related)' },
      },
      required: ['project', 'sourceId', 'targetId'],
    },
  },
  {
    name: 'add_work_item_comment',
    description: 'Add a comment to a work item',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        workItemId: { type: 'number', description: 'Work item ID' },
        text: { type: 'string', description: 'Comment text' },
      },
      required: ['project', 'workItemId', 'text'],
    },
  },
  {
    name: 'get_my_work_items',
    description: 'Get work items assigned to or created by current user',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        assignedToMe: { type: 'boolean', description: 'True for assigned, false for created by' },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_work_items_for_iteration',
    description: 'Get work items for a specific iteration',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        iterationPath: { type: 'string', description: 'Iteration path' },
      },
      required: ['project', 'iterationPath'],
    },
  },
  {
    name: 'list_backlogs',
    description: 'List backlogs for a team',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        team: { type: 'string', description: 'Team name or ID' },
      },
      required: ['project', 'team'],
    },
  },
  {
    name: 'list_backlog_work_items',
    description: 'List work items in a backlog',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        team: { type: 'string', description: 'Team name or ID' },
        backlogId: { type: 'string', description: 'Backlog ID' },
      },
      required: ['project', 'team', 'backlogId'],
    },
  },
  {
    name: 'update_pull_request',
    description: 'Update a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        pullRequestId: { type: 'number', description: 'Pull request ID' },
        updates: { type: 'object', description: 'Update fields' },
      },
      required: ['project', 'repositoryId', 'pullRequestId', 'updates'],
    },
  },
  {
    name: 'update_pull_request_reviewers',
    description: 'Update reviewers for a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        pullRequestId: { type: 'number', description: 'Pull request ID' },
        reviewers: { type: 'array', description: 'Array of reviewer objects' },
      },
      required: ['project', 'repositoryId', 'pullRequestId', 'reviewers'],
    },
  },
  {
    name: 'list_pull_request_threads',
    description: 'List threads in a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        pullRequestId: { type: 'number', description: 'Pull request ID' },
      },
      required: ['project', 'repositoryId', 'pullRequestId'],
    },
  },
  {
    name: 'create_pull_request_thread',
    description: 'Create a new thread in a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        pullRequestId: { type: 'number', description: 'Pull request ID' },
        thread: { type: 'object', description: 'Thread object with comments' },
      },
      required: ['project', 'repositoryId', 'pullRequestId', 'thread'],
    },
  },
  {
    name: 'reply_to_pull_request_comment',
    description: 'Reply to a pull request comment',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID or name' },
        pullRequestId: { type: 'number', description: 'Pull request ID' },
        threadId: { type: 'number', description: 'Thread ID' },
        comment: { type: 'object', description: 'Comment object' },
      },
      required: ['project', 'repositoryId', 'pullRequestId', 'threadId', 'comment'],
    },
  },
  {
    name: 'get_build_status',
    description: 'Get status of a specific build',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        buildId: { type: 'number', description: 'Build ID' },
      },
      required: ['project', 'buildId'],
    },
  },
  {
    name: 'get_build_log',
    description: 'Get logs for a build',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        buildId: { type: 'number', description: 'Build ID' },
      },
      required: ['project', 'buildId'],
    },
  },
  {
    name: 'run_pipeline',
    description: 'Trigger a pipeline run',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        pipelineId: { type: 'number', description: 'Pipeline ID' },
        parameters: { type: 'object', description: 'Optional pipeline parameters' },
      },
      required: ['project', 'pipelineId'],
    },
  },
  {
    name: 'get_pipeline_run',
    description: 'Get details of a pipeline run',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        pipelineId: { type: 'number', description: 'Pipeline ID' },
        runId: { type: 'number', description: 'Run ID' },
      },
      required: ['project', 'pipelineId', 'runId'],
    },
  },
  {
    name: 'list_pipeline_runs',
    description: 'List runs for a pipeline',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        pipelineId: { type: 'number', description: 'Pipeline ID' },
        top: { type: 'number', description: 'Number of runs (default 10)' },
      },
      required: ['project', 'pipelineId'],
    },
  },
  {
    name: 'create_iteration',
    description: 'Create a single iteration (sprint) with optional start and end dates',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        name: { type: 'string', description: 'Iteration/sprint name (e.g., "Sprint 1", "January Sprint")' },
        startDate: { type: 'string', description: 'Start date (e.g., "2025-01-06" or "January 6, 2025")' },
        finishDate: { type: 'string', description: 'End/finish date (e.g., "2025-01-17" or "January 17, 2025")' },
        parentPath: { type: 'string', description: 'Optional parent iteration path for nested iterations' },
      },
      required: ['project', 'name'],
    },
  },
  {
    name: 'create_iterations',
    description: 'Create multiple iterations (sprints) in batch. Each iteration can have name, startDate, finishDate, and optional parentPath.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        iterations: {
          type: 'array',
          description: 'Array of iteration objects with name, startDate, finishDate, and optional parentPath',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Iteration name' },
              startDate: { type: 'string', description: 'Start date' },
              finishDate: { type: 'string', description: 'End date' },
              parentPath: { type: 'string', description: 'Optional parent path' },
            },
            required: ['name'],
          },
        },
      },
      required: ['project', 'iterations'],
    },
  },
  {
    name: 'get_team_capacity',
    description: 'Get team capacity for an iteration',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        team: { type: 'string', description: 'Team name or ID' },
        iterationId: { type: 'string', description: 'Iteration ID' },
      },
      required: ['project', 'team', 'iterationId'],
    },
  },
  {
    name: 'update_team_capacity',
    description: 'Update team capacity for an iteration',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        team: { type: 'string', description: 'Team name or ID' },
        iterationId: { type: 'string', description: 'Iteration ID' },
        capacities: { type: 'array', description: 'Array of capacity objects' },
      },
      required: ['project', 'team', 'iterationId', 'capacities'],
    },
  },
  {
    name: 'get_wiki',
    description: 'Get details of a specific wiki',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        wikiIdentifier: { type: 'string', description: 'Wiki ID or name' },
      },
      required: ['project', 'wikiIdentifier'],
    },
  },
  {
    name: 'list_wiki_pages',
    description: 'List pages in a wiki',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        wikiIdentifier: { type: 'string', description: 'Wiki ID or name' },
        path: { type: 'string', description: 'Path to list pages from (default /)' },
      },
      required: ['project', 'wikiIdentifier'],
    },
  },
  {
    name: 'create_or_update_wiki_page',
    description: 'Create or update a wiki page',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        wikiIdentifier: { type: 'string', description: 'Wiki ID or name' },
        path: { type: 'string', description: 'Page path' },
        content: { type: 'string', description: 'Page content (markdown)' },
        comment: { type: 'string', description: 'Optional commit comment' },
      },
      required: ['project', 'wikiIdentifier', 'path', 'content'],
    },
  },
  {
    name: 'create_test_plan',
    description: 'Create a new test plan',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        name: { type: 'string', description: 'Test plan name' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: ['project', 'name'],
    },
  },
  {
    name: 'list_test_suites',
    description: 'List test suites in a test plan',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        planId: { type: 'number', description: 'Test plan ID' },
      },
      required: ['project', 'planId'],
    },
  },
  {
    name: 'create_test_suite',
    description: 'Create a test suite in a test plan',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        planId: { type: 'number', description: 'Test plan ID' },
        name: { type: 'string', description: 'Suite name' },
        suiteType: { type: 'string', description: 'Suite type (default: StaticTestSuite)' },
      },
      required: ['project', 'planId', 'name'],
    },
  },
  {
    name: 'list_test_cases',
    description: 'List test cases in a test suite',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        planId: { type: 'number', description: 'Test plan ID' },
        suiteId: { type: 'number', description: 'Test suite ID' },
      },
      required: ['project', 'planId', 'suiteId'],
    },
  },
  {
    name: 'create_test_case',
    description: 'Create a new test case',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        title: { type: 'string', description: 'Test case title' },
        steps: { type: 'array', description: 'Optional test steps' },
      },
      required: ['project', 'title'],
    },
  },
  {
    name: 'search_wiki',
    description: 'Search wiki pages',
    inputSchema: {
      type: 'object',
      properties: {
        searchText: { type: 'string', description: 'Search text' },
        project: { type: 'string', description: 'Optional project filter' },
        wikiIdentifier: { type: 'string', description: 'Optional wiki filter' },
        top: { type: 'number', description: 'Number of results (default 10)' },
      },
      required: ['searchText'],
    },
  },
  {
    name: 'get_advanced_security_alerts',
    description: 'Get advanced security alerts for a repository',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID' },
        severity: { type: 'string', description: 'Optional severity filter' },
        state: { type: 'string', description: 'Optional state filter' },
        top: { type: 'number', description: 'Number of alerts (default 100)' },
      },
      required: ['project', 'repositoryId'],
    },
  },
  {
    name: 'get_advanced_security_alert_details',
    description: 'Get details of a specific security alert',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        repositoryId: { type: 'string', description: 'Repository ID' },
        alertId: { type: 'string', description: 'Alert ID' },
      },
      required: ['project', 'repositoryId', 'alertId'],
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

      case 'get_repository': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const repo = await azureClient.getRepositoryById(project, repositoryId);
        return { content: [{ type: 'text', text: JSON.stringify(repo, null, 2) }] };
      }

      case 'get_branch': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const branchName = args?.branchName as string;
        const branch = await azureClient.getBranchByName(project, repositoryId, branchName);
        return { content: [{ type: 'text', text: JSON.stringify(branch, null, 2) }] };
      }

      case 'create_branch': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const name = args?.name as string;
        const sourceBranch = args?.sourceBranch as string;
        const branch = await azureClient.createBranch(project, repositoryId, name, sourceBranch);
        return { content: [{ type: 'text', text: JSON.stringify(branch, null, 2) }] };
      }

      case 'search_commits': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const searchCriteria = args?.searchCriteria as any;
        const top = (args?.top as number) || 100;
        const commits = await azureClient.searchCommits(project, repositoryId, searchCriteria, top);
        return { content: [{ type: 'text', text: JSON.stringify(commits, null, 2) }] };
      }

      case 'update_work_items_batch': {
        const project = args?.project as string;
        const updates = args?.updates as any[];
        const result = await azureClient.updateWorkItemsBatch(project, updates);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'add_child_work_items': {
        const project = args?.project as string;
        const parentId = args?.parentId as number;
        const childIds = args?.childIds as number[];
        const result = await azureClient.addChildWorkItems(project, parentId, childIds);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'link_work_items': {
        const project = args?.project as string;
        const sourceId = args?.sourceId as number;
        const targetId = args?.targetId as number;
        const linkType = (args?.linkType as string) || 'System.LinkTypes.Related';
        const result = await azureClient.linkWorkItems(project, sourceId, targetId, linkType);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'add_work_item_comment': {
        const project = args?.project as string;
        const workItemId = args?.workItemId as number;
        const text = args?.text as string;
        const result = await azureClient.addWorkItemComment(project, workItemId, text);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_my_work_items': {
        const project = args?.project as string;
        const assignedToMe = (args?.assignedToMe as boolean) ?? true;
        const workItems = await azureClient.getMyWorkItems(project, assignedToMe);
        return { content: [{ type: 'text', text: JSON.stringify(workItems, null, 2) }] };
      }

      case 'get_work_items_for_iteration': {
        const project = args?.project as string;
        const iterationPath = args?.iterationPath as string;
        const workItems = await azureClient.getWorkItemsForIteration(project, iterationPath);
        return { content: [{ type: 'text', text: JSON.stringify(workItems, null, 2) }] };
      }

      case 'list_backlogs': {
        const project = args?.project as string;
        const team = args?.team as string;
        const backlogs = await azureClient.listBacklogs(project, team);
        return { content: [{ type: 'text', text: JSON.stringify(backlogs, null, 2) }] };
      }

      case 'list_backlog_work_items': {
        const project = args?.project as string;
        const team = args?.team as string;
        const backlogId = args?.backlogId as string;
        const workItems = await azureClient.listBacklogWorkItems(project, team, backlogId);
        return { content: [{ type: 'text', text: JSON.stringify(workItems, null, 2) }] };
      }

      case 'update_pull_request': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const updates = args?.updates as any;
        const pr = await azureClient.updatePullRequest(project, repositoryId, pullRequestId, updates);
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'update_pull_request_reviewers': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const reviewers = args?.reviewers as any[];
        const result = await azureClient.updatePullRequestReviewers(project, repositoryId, pullRequestId, reviewers);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_pull_request_threads': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const threads = await azureClient.listPullRequestThreads(project, repositoryId, pullRequestId);
        return { content: [{ type: 'text', text: JSON.stringify(threads, null, 2) }] };
      }

      case 'create_pull_request_thread': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const thread = args?.thread as any;
        const result = await azureClient.createPullRequestThread(project, repositoryId, pullRequestId, thread);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'reply_to_pull_request_comment': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const pullRequestId = args?.pullRequestId as number;
        const threadId = args?.threadId as number;
        const comment = args?.comment as any;
        const result = await azureClient.replyToPullRequestComment(project, repositoryId, pullRequestId, threadId, comment);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_build_status': {
        const project = args?.project as string;
        const buildId = args?.buildId as number;
        const status = await azureClient.getBuildStatus(project, buildId);
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      }

      case 'get_build_log': {
        const project = args?.project as string;
        const buildId = args?.buildId as number;
        const logs = await azureClient.getBuildLog(project, buildId);
        return { content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }] };
      }

      case 'run_pipeline': {
        const project = args?.project as string;
        const pipelineId = args?.pipelineId as number;
        const parameters = args?.parameters as any;
        const run = await azureClient.runPipeline(project, pipelineId, parameters);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'get_pipeline_run': {
        const project = args?.project as string;
        const pipelineId = args?.pipelineId as number;
        const runId = args?.runId as number;
        const run = await azureClient.getPipelineRun(project, pipelineId, runId);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'list_pipeline_runs': {
        const project = args?.project as string;
        const pipelineId = args?.pipelineId as number;
        const top = (args?.top as number) || 10;
        const runs = await azureClient.listPipelineRuns(project, pipelineId, top);
        return { content: [{ type: 'text', text: JSON.stringify(runs, null, 2) }] };
      }

      case 'create_iteration': {
        const project = args?.project as string;
        const name = args?.name as string;
        const startDate = args?.startDate as string | undefined;
        const finishDate = args?.finishDate as string | undefined;
        const parentPath = args?.parentPath as string | undefined;
        const result = await azureClient.createIteration(project, name, startDate, finishDate, parentPath);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create_iterations': {
        const project = args?.project as string;
        const iterations = args?.iterations as any[];
        const result = await azureClient.createIterations(project, iterations);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_team_capacity': {
        const project = args?.project as string;
        const team = args?.team as string;
        const iterationId = args?.iterationId as string;
        const capacity = await azureClient.getTeamCapacity(project, team, iterationId);
        return { content: [{ type: 'text', text: JSON.stringify(capacity, null, 2) }] };
      }

      case 'update_team_capacity': {
        const project = args?.project as string;
        const team = args?.team as string;
        const iterationId = args?.iterationId as string;
        const capacities = args?.capacities as any[];
        const result = await azureClient.updateTeamCapacity(project, team, iterationId, capacities);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_wiki': {
        const project = args?.project as string;
        const wikiIdentifier = args?.wikiIdentifier as string;
        const wiki = await azureClient.getWiki(project, wikiIdentifier);
        return { content: [{ type: 'text', text: JSON.stringify(wiki, null, 2) }] };
      }

      case 'list_wiki_pages': {
        const project = args?.project as string;
        const wikiIdentifier = args?.wikiIdentifier as string;
        const path = (args?.path as string) || '/';
        const pages = await azureClient.listWikiPages(project, wikiIdentifier, path);
        return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] };
      }

      case 'create_or_update_wiki_page': {
        const project = args?.project as string;
        const wikiIdentifier = args?.wikiIdentifier as string;
        const path = args?.path as string;
        const content = args?.content as string;
        const comment = args?.comment as string | undefined;
        const result = await azureClient.createOrUpdateWikiPage(project, wikiIdentifier, path, content, comment);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create_test_plan': {
        const project = args?.project as string;
        const name = args?.name as string;
        const description = args?.description as string | undefined;
        const plan = await azureClient.createTestPlan(project, name, description);
        return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
      }

      case 'list_test_suites': {
        const project = args?.project as string;
        const planId = args?.planId as number;
        const suites = await azureClient.listTestSuites(project, planId);
        return { content: [{ type: 'text', text: JSON.stringify(suites, null, 2) }] };
      }

      case 'create_test_suite': {
        const project = args?.project as string;
        const planId = args?.planId as number;
        const name = args?.name as string;
        const suiteType = (args?.suiteType as string) || 'StaticTestSuite';
        const suite = await azureClient.createTestSuite(project, planId, name, suiteType);
        return { content: [{ type: 'text', text: JSON.stringify(suite, null, 2) }] };
      }

      case 'list_test_cases': {
        const project = args?.project as string;
        const planId = args?.planId as number;
        const suiteId = args?.suiteId as number;
        const cases = await azureClient.listTestCases(project, planId, suiteId);
        return { content: [{ type: 'text', text: JSON.stringify(cases, null, 2) }] };
      }

      case 'create_test_case': {
        const project = args?.project as string;
        const title = args?.title as string;
        const steps = args?.steps as any[] | undefined;
        const testCase = await azureClient.createTestCase(project, title, steps);
        return { content: [{ type: 'text', text: JSON.stringify(testCase, null, 2) }] };
      }

      case 'search_wiki': {
        const searchText = args?.searchText as string;
        const project = args?.project as string | undefined;
        const wikiIdentifier = args?.wikiIdentifier as string | undefined;
        const top = (args?.top as number) || 10;
        const results = await azureClient.searchWiki(searchText, project, wikiIdentifier, top);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      case 'get_advanced_security_alerts': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const severity = args?.severity as string | undefined;
        const state = args?.state as string | undefined;
        const top = (args?.top as number) || 100;
        const alerts = await azureClient.getAdvancedSecurityAlerts(project, repositoryId, severity, state, top);
        return { content: [{ type: 'text', text: JSON.stringify(alerts, null, 2) }] };
      }

      case 'get_advanced_security_alert_details': {
        const project = args?.project as string;
        const repositoryId = args?.repositoryId as string;
        const alertId = args?.alertId as string;
        const details = await azureClient.getAdvancedSecurityAlertDetails(project, repositoryId, alertId);
        return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }] };
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
