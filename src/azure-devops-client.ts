import axios, { AxiosInstance } from 'axios';
import { InteractiveBrowserCredential, TokenCredential } from '@azure/identity';
import dotenv from 'dotenv';

dotenv.config();

// Azure DevOps scope for OAuth
const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

// Authentication mode detection
const USE_PAT = !!process.env.AZURE_DEVOPS_PAT;

// Singleton credential and token cache to avoid multiple login prompts
let sharedCredential: TokenCredential | null = null;
let cachedToken: { token: string; expiresOn: Date } | null = null;
let tokenPromise: Promise<string> | null = null;

// Get authorization header based on auth mode
function getAuthHeader(): string {
  if (USE_PAT) {
    const pat = process.env.AZURE_DEVOPS_PAT!;
    const base64Pat = Buffer.from(`:${pat}`).toString('base64');
    return `Basic ${base64Pat}`;
  }
  throw new Error('No PAT token available - use getAccessToken for OAuth flow');
}

async function getAccessToken(): Promise<string> {
  // If using PAT, return it directly
  if (USE_PAT) {
    return process.env.AZURE_DEVOPS_PAT!;
  }

  // If we have a valid cached token, return it
  if (cachedToken && cachedToken.expiresOn > new Date(Date.now() + 60000)) {
    return cachedToken.token;
  }

  // If a token request is already in progress, wait for it
  if (tokenPromise) {
    return tokenPromise;
  }

  // Create a new token request
  tokenPromise = (async () => {
    try {
      // Initialize credential if not exists
      if (!sharedCredential) {
        console.error('Initializing Interactive Browser authentication...');
        console.error('A browser window will open for you to sign in.');
        sharedCredential = new InteractiveBrowserCredential({
          redirectUri: 'http://localhost:8400',
          loginHint: process.env.AZURE_LOGIN_HINT, // Optional: pre-fill email
        });
      }

      console.error('Acquiring access token...');
      const tokenResponse = await sharedCredential.getToken(AZURE_DEVOPS_SCOPE);
      if (!tokenResponse) {
        throw new Error('Failed to acquire access token');
      }

      cachedToken = {
        token: tokenResponse.token,
        expiresOn: tokenResponse.expiresOnTimestamp
          ? new Date(tokenResponse.expiresOnTimestamp)
          : new Date(Date.now() + 3600 * 1000), // Default 1 hour
      };

      console.error('Authentication successful!');
      return cachedToken.token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

export interface WorkItem {
  id: number;
  rev: number;
  fields: Record<string, any>;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface Build {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime: string;
  startTime: string;
  finishTime: string;
  sourceBranch: string;
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  webUrl: string;
  size?: number;
  isDisabled?: boolean;
  isFork?: boolean;
}

export interface Branch {
  name: string;
  objectId: string;
  creator?: {
    displayName: string;
    uniqueName: string;
  };
}

export interface PullRequest {
  pullRequestId: number;
  repository: {
    id: string;
    name: string;
  };
  title: string;
  description?: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
  };
  creationDate: string;
  status: string;
  sourceRefName: string;
  targetRefName: string;
  isDraft?: boolean;
}

export class AzureDevOpsClient {
  private axiosInstance: AxiosInstance | null = null;
  private organization: string;
  private initialized: boolean = false;

  constructor() {
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    if (!orgUrl) {
      throw new Error('AZURE_DEVOPS_ORG_URL is not defined in environment variables');
    }

    // Extract organization from URL (e.g., https://dev.azure.com/{organization})
    const match = orgUrl.match(/dev\.azure\.com\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid AZURE_DEVOPS_ORG_URL format. Expected https://dev.azure.com/{organization}');
    }
    this.organization = match[1];
    console.error(`Azure DevOps client created for organization: ${this.organization}`);
  }

  private async ensureInitialized(): Promise<AxiosInstance> {
    if (this.axiosInstance && this.initialized) {
      return this.axiosInstance;
    }

    const authHeader = USE_PAT ? getAuthHeader() : `Bearer ${await getAccessToken()}`;

    this.axiosInstance = axios.create({
      baseURL: `https://dev.azure.com/${this.organization}`,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
    this.initialized = true;
    return this.axiosInstance;
  }

  // Refresh token if needed before each request
  private async getClient(): Promise<AxiosInstance> {
    const client = await this.ensureInitialized();
    if (!USE_PAT) {
      // Only refresh token for OAuth flow
      const token = await getAccessToken();
      client.defaults.headers['Authorization'] = `Bearer ${token}`;
    }
    return client;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    const client = await this.getClient();
    const response = await client.get('/_apis/projects?api-version=7.1');
    return response.data.value;
  }

  // Work Items
  async getWorkItems(ids: number[], project: string): Promise<WorkItem[]> {
    if (ids.length === 0) return [];
    const client = await this.getClient();
    const idsString = ids.join(',');
    const response = await client.get(
      `/${project}/_apis/wit/workitems?ids=${idsString}&api-version=7.1`
    );
    return response.data.value;
  }

  async queryWorkItems(wiql: string, project: string): Promise<WorkItem[]> {
    const client = await this.getClient();
    const response = await client.post(
      `/${project}/_apis/wit/wiql?api-version=7.1`,
      { query: wiql }
    );
    const workItemRefs = response.data.workItems;
    if (!workItemRefs || workItemRefs.length === 0) {
      return [];
    }
    const ids = workItemRefs.map((wi: any) => wi.id);
    return this.getWorkItems(ids, project);
  }

  async createWorkItem(
    project: string,
    workItemType: string,
    title: string,
    description?: string,
    additionalFields?: Record<string, any>
  ): Promise<WorkItem> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/$${workItemType}?api-version=7.1`;
    const fields: Record<string, any> = {
      'System.Title': title,
      ...(description && { 'System.Description': description }),
      ...additionalFields,
    };
    const patchDocument = Object.entries(fields).map(([field, value]) => ({
      op: 'add',
      path: `/fields/${field}`,
      value,
    }));
    const response = await client.post(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async updateWorkItem(
    project: string,
    id: number,
    fields: Record<string, any>,
    comment?: string
  ): Promise<WorkItem> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${id}?api-version=7.1`;
    const patchDocument = Object.entries(fields).map(([field, value]) => ({
      op: 'add',
      path: `/fields/${field}`,
      value,
    }));
    if (comment) {
      patchDocument.push({
        op: 'add',
        path: '/fields/System.History',
        value: comment,
      });
    }
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async updateWorkItemsBatch(project: string, updates: any[]): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitemsbatch?api-version=7.1`;
    const body = {
      updates,
    };
    const response = await client.post(url, body);
    return response.data.value || [];
  }

  async addChildWorkItems(project: string, parentId: number, childIds: number[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${parentId}?api-version=7.1`;
    const patchDocument = childIds.map(childId => ({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Forward',
        url: `${this.organization}/${project}/_apis/wit/workitems/${childId}`,
        attributes: {
          comment: 'Added as child work item',
        },
      },
    }));
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async linkWorkItems(project: string, sourceId: number, targetId: number, linkType: string = 'System.LinkTypes.Related'): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${sourceId}?api-version=7.1`;
    const patchDocument = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: linkType,
          url: `${this.organization}/${project}/_apis/wit/workitems/${targetId}`,
          attributes: {
            comment: 'Linked work items',
          },
        },
      },
    ];
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async unlinkWorkItem(project: string, workItemId: number, relationId: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    const patchDocument = [
      {
        op: 'remove',
        path: `/relations/${relationId}`,
      },
    ];
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async addArtifactLink(project: string, workItemId: number, artifactUri: string, artifactType: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    const patchDocument = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'ArtifactLink',
          url: artifactUri,
          attributes: {
            name: artifactType,
          },
        },
      },
    ];
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async linkWorkItemToPullRequest(project: string, workItemId: number, repositoryId: string, pullRequestId: number): Promise<any> {
    const artifactUri = `vstfs:///Git/PullRequestId/${project}%2F${repositoryId}%2F${pullRequestId}`;
    return this.addArtifactLink(project, workItemId, artifactUri, 'Pull Request');
  }

  async addWorkItemComment(project: string, workItemId: number, text: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${workItemId}/comments?api-version=7.1-preview.4`;
    const body = {
      text,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  async getMyWorkItems(project: string, assignedToMe: boolean = true): Promise<WorkItem[]> {
    const client = await this.getClient();
    const user = await this.getCurrentUser();
    const wiql = assignedToMe
      ? `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = '${user.uniqueName}' AND [System.TeamProject] = '${project}'`
      : `SELECT [System.Id] FROM WorkItems WHERE [System.CreatedBy] = '${user.uniqueName}' AND [System.TeamProject] = '${project}'`;
    return this.queryWorkItems(wiql, project);
  }

  async getWorkItemsForIteration(project: string, iterationPath: string): Promise<WorkItem[]> {
    const client = await this.getClient();
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = '${iterationPath}' AND [System.TeamProject] = '${project}'`;
    return this.queryWorkItems(wiql, project);
  }

  async listBacklogs(project: string, team: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/backlogs?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async listBacklogWorkItems(project: string, team: string, backlogId: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/backlogs/${backlogId}/workitems?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async getQueryResults(project: string, queryId: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/queries/${queryId}?api-version=7.1&$expand=all`;
    const response = await client.get(url);
    return response.data.workItems || [];
  }

  async getWorkItemTypes(project: string): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/wit/workitemtypes?api-version=7.1`
    );
    return response.data.value;
  }

  // Teams
  async getTeams(project: string, mine?: boolean, top?: number, skip?: number): Promise<any[]> {
    const client = await this.getClient();
    let url = `/_apis/projects/${project}/teams?api-version=7.1`;
    const params = new URLSearchParams();
    if (mine !== undefined) params.append('$mine', mine.toString());
    if (top !== undefined) params.append('$top', top.toString());
    if (skip !== undefined) params.append('$skip', skip.toString());
    if (params.toString()) url += `&${params.toString()}`;
    const response = await client.get(url);
    return response.data.value;
  }

  async getTeamMembers(project: string, team: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/_apis/projects/${project}/teams/${team}/members?api-version=7.1`;
    try {
      const response = await client.get(url);
      return response.data.value || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  // Repositories
  async getRepositories(project: string): Promise<Repository[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories?api-version=7.1`
    );
    return response.data.value;
  }

  async getRepositoryById(project: string, repositoryId: string): Promise<Repository> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}?api-version=7.1`
    );
    return response.data;
  }

  async getBranches(project: string, repositoryId: string): Promise<Branch[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/refs?filter=heads&api-version=7.1`
    );
    return response.data.value.map((ref: any) => ({
      name: ref.name.replace('refs/heads/', ''),
      objectId: ref.objectId,
      creator: ref.creator,
    }));
  }

  async getMyBranches(project: string, repositoryId: string): Promise<Branch[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/refs?filter=heads&api-version=7.1`
    );
    const allBranches = response.data.value.map((ref: any) => ({
      name: ref.name.replace('refs/heads/', ''),
      objectId: ref.objectId,
      creator: ref.creator,
    }));
    
    // Filter branches created by current user (simplified - would need current user identity)
    // For now, return all branches
    return allBranches;
  }

  async getBranchByName(project: string, repositoryId: string, branchName: string): Promise<Branch> {
    const client = await this.getClient();
    const fullBranchName = `refs/heads/${branchName}`;
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/refs?filter=${encodeURIComponent(fullBranchName)}&api-version=7.1`
    );
    const ref = response.data.value[0];
    return {
      name: ref.name.replace('refs/heads/', ''),
      objectId: ref.objectId,
      creator: ref.creator,
    };
  }

  async createBranch(project: string, repositoryId: string, name: string, sourceBranch: string): Promise<Branch> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/refs?api-version=7.1`;
    const body = [
      {
        name: `refs/heads/${name}`,
        oldObjectId: '0000000000000000000000000000000000000000',
        newObjectId: await this.getBranchObjectId(project, repositoryId, sourceBranch),
      },
    ];
    const response = await client.post(url, body);
    const ref = response.data.value[0];
    return {
      name: ref.name.replace('refs/heads/', ''),
      objectId: ref.newObjectId,
      creator: ref.creator,
    };
  }

  private async getBranchObjectId(project: string, repositoryId: string, branchName: string): Promise<string> {
    const branch = await this.getBranchByName(project, repositoryId, branchName);
    return branch.objectId;
  }

  async searchCommits(
    project: string,
    repositoryId: string,
    searchCriteria: any,
    top: number = 100
  ): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/commits?api-version=7.1&$top=${top}`;
    const response = await client.post(url, searchCriteria);
    return response.data.value || [];
  }

  async getCommits(project: string, repositoryId: string, top: number = 10): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/commits?api-version=7.1&$top=${top}`
    );
    return response.data.value;
  }

  async getFileContent(project: string, repositoryId: string, path: string): Promise<string> {
    const client = await this.getClient();
    const encodedPath = encodeURIComponent(path);
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/items?path=${encodedPath}&api-version=7.1`
    );
    return response.data;
  }

  async listPullRequestsByCommits(project: string, repositoryId: string, commitIds: string[]): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests?api-version=7.1`;
    const body = {
      commitIds,
    };
    const response = await client.post(url, body);
    return response.data.value || [];
  }

  async updatePullRequest(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    updates: any
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=7.1`;
    const response = await client.patch(url, updates);
    return response.data;
  }

  async updatePullRequestReviewers(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    reviewers: any[]
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/reviewers?api-version=7.1`;
    const body = reviewers;
    const response = await client.post(url, body);
    return response.data;
  }

  async listPullRequestThreads(project: string, repositoryId: string, pullRequestId: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async listPullRequestThreadComments(project: string, repositoryId: string, pullRequestId: number, threadId: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async createPullRequestThread(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    thread: any
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads?api-version=7.1`;
    const response = await client.post(url, thread);
    return response.data;
  }

  async updatePullRequestThread(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    updates: any
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}?api-version=7.1`;
    const response = await client.patch(url, updates);
    return response.data;
  }

  async replyToPullRequestComment(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    comment: any
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments?api-version=7.1`;
    const response = await client.post(url, comment);
    return response.data;
  }

  // Pull Requests
  async getPullRequests(
    project: string,
    repositoryId?: string,
    top: number = 100,
    status: string = 'active'
  ): Promise<PullRequest[]> {
    const client = await this.getClient();
    let url = `/${project}/_apis/git/pullrequests?api-version=7.1&$top=${top}&searchCriteria.status=${status}`;
    if (repositoryId) {
      url += `&searchCriteria.repositoryId=${repositoryId}`;
    }
    const response = await client.get(url);
    return response.data.value.map((pr: any) => ({
      pullRequestId: pr.pullRequestId,
      repository: pr.repository,
      title: pr.title,
      description: pr.description,
      createdBy: pr.createdBy,
      creationDate: pr.creationDate,
      status: pr.status,
      sourceRefName: pr.sourceRefName,
      targetRefName: pr.targetRefName,
      isDraft: pr.isDraft,
    }));
  }

  async getPullRequestById(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Promise<PullRequest> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=7.1`
    );
    const pr = response.data;
    return {
      pullRequestId: pr.pullRequestId,
      repository: pr.repository,
      title: pr.title,
      description: pr.description,
      createdBy: pr.createdBy,
      creationDate: pr.creationDate,
      status: pr.status,
      sourceRefName: pr.sourceRefName,
      targetRefName: pr.targetRefName,
      isDraft: pr.isDraft,
    };
  }

  async createPullRequest(
    project: string,
    repositoryId: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/git/repositories/${repositoryId}/pullrequests?api-version=7.1`;
    const body = {
      sourceRefName: `refs/heads/${sourceBranch}`,
      targetRefName: `refs/heads/${targetBranch}`,
      title,
      description,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  // Builds/Pipelines
  async getBuilds(project: string, definitionId?: number, top: number = 10): Promise<Build[]> {
    const client = await this.getClient();
    let url = `/${project}/_apis/build/builds?api-version=7.1&$top=${top}`;
    if (definitionId) {
      url += `&definitions=${definitionId}`;
    }
    const response = await client.get(url);
    return response.data.value;
  }

  async getBuildDefinitions(project: string): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/definitions?api-version=7.1`
    );
    return response.data.value;
  }

  async getPipelines(project: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/pipelines?api-version=7.1`;
    try {
      const response = await client.get(url);
      return response.data.value || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async getBuildStatus(project: string, buildId: number): Promise<any> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/builds/${buildId}?api-version=7.1`
    );
    return response.data;
  }

  async getBuildLog(project: string, buildId: number): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/builds/${buildId}/logs?api-version=7.1`
    );
    return response.data.value || [];
  }

  async getBuildLogById(project: string, buildId: number, logId: number): Promise<any> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/builds/${buildId}/logs/${logId}?api-version=7.1`
    );
    return response.data;
  }

  async getBuildChanges(project: string, buildId: number): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/builds/${buildId}/changes?api-version=7.1`
    );
    return response.data.value || [];
  }

  async getBuildDefinitionRevisions(project: string, definitionId: number): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/build/definitions/${definitionId}/revisions?api-version=7.1`
    );
    return response.data.value || [];
  }

  async createPipeline(project: string, name: string, configuration: any): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/pipelines?api-version=7.1`;
    const body = {
      name,
      configuration,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  async runPipeline(project: string, pipelineId: number, parameters?: any): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1`;
    const body = {
      parameters,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  async getPipelineRun(project: string, pipelineId: number, runId: number): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/pipelines/${pipelineId}/runs/${runId}?api-version=7.1`;
    const response = await client.get(url);
    return response.data;
  }

  async listPipelineRuns(project: string, pipelineId: number, top: number = 10): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/pipelines/${pipelineId}/runs?api-version=7.1&$top=${top}`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async updateBuildStage(project: string, buildId: number, stageRefName: string, state: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/build/builds/${buildId}/stages/${stageRefName}?api-version=7.1`;
    const body = {
      state,
    };
    const response = await client.patch(url, body);
    return response.data;
  }

  // Iterations
  async getIterations(project: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/classificationnodes/iterations?$depth=2&api-version=7.1`;
    try {
      const response = await client.get(url);
      return response.data.children || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async createIterations(project: string, iterations: any[]): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/classificationnodes/iterations?api-version=7.1`;
    const body = {
      value: iterations,
    };
    const response = await client.post(url, body);
    return response.data.value || [];
  }

  async getTeamIterations(project: string, team: string): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/${team}/_apis/work/teamsettings/iterations?api-version=7.1`
    );
    return response.data.value;
  }

  async assignIterations(project: string, team: string, iterationIds: string[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/teamsettings/iterations?api-version=7.1`;
    const body = iterationIds.map(id => ({ id }));
    const response = await client.post(url, body);
    return response.data;
  }

  async getIterationCapacities(project: string, iterationId: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/work/teamsettings/iterations/${iterationId}/capacities?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async getTeamCapacity(project: string, team: string, iterationId: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/teamsettings/iterations/${iterationId}/capacities?api-version=7.1`;
    const response = await client.get(url);
    return response.data;
  }

  async updateTeamCapacity(project: string, team: string, iterationId: string, capacities: any[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/teamsettings/iterations/${iterationId}/capacities?api-version=7.1`;
    const body = capacities;
    const response = await client.put(url, body);
    return response.data;
  }

  // Areas
  async getAreas(project: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/classificationnodes/areas?$depth=2&api-version=7.1`;
    try {
      const response = await client.get(url);
      return response.data.children || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  // Search
  async searchCode(
    searchText: string,
    project?: string,
    repository?: string,
    top: number = 10
  ): Promise<any[]> {
    const client = await this.getClient();
    const url = `https://almsearch.dev.azure.com/${this.organization}/_apis/search/codesearchresults?api-version=7.1`;
    const body: any = {
      searchText,
      $top: top,
    };
    const filters: any = {};
    if (project) filters.Project = [project];
    if (repository) filters.Repository = [repository];
    if (Object.keys(filters).length > 0) {
      body.filters = filters;
    }
    const response = await client.post(url, body);
    return response.data.results || [];
  }

  async searchWorkItems(
    searchText: string,
    project?: string,
    top: number = 10
  ): Promise<any[]> {
    const client = await this.getClient();
    const url = `https://almsearch.dev.azure.com/${this.organization}/_apis/search/workitemsearchresults?api-version=7.1`;
    const body: any = {
      searchText,
      $top: top,
    };
    if (project) {
      body.filters = { 'System.TeamProject': [project] };
    }
    const response = await client.post(url, body);
    return response.data.results || [];
  }

  async searchWiki(
    searchText: string,
    project?: string,
    wikiIdentifier?: string,
    top: number = 10
  ): Promise<any[]> {
    const client = await this.getClient();
    const url = `https://almsearch.dev.azure.com/${this.organization}/_apis/search/wikisearchresults?api-version=7.1`;
    const body: any = {
      searchText,
      $top: top,
    };
    const filters: any = {};
    if (project) filters.Project = [project];
    if (wikiIdentifier) filters.Wiki = [wikiIdentifier];
    if (Object.keys(filters).length > 0) {
      body.filters = filters;
    }
    const response = await client.post(url, body);
    return response.data.results || [];
  }

  // Identity
  async searchIdentities(searchFilter: string): Promise<any> {
    const token = await getAccessToken();
    const url = `https://vssps.dev.azure.com/${this.organization}/_apis/identities`;
    const params = new URLSearchParams({
      'api-version': '7.1',
      'searchFilter': 'General',
      'filterValue': searchFilter,
    });
    const response = await axios.get(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }

  async getCurrentUser(): Promise<any> {
    const client = await this.getClient();
    const response = await client.get('/_apis/connectionData');
    return response.data.authenticatedUser;
  }

  // Boards
  async getBoards(project: string, team: string): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/${team}/_apis/work/boards?api-version=7.1`;
    try {
      const response = await client.get(url);
      return response.data.value || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  // Queries
  async getQueries(project: string): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/wit/queries?api-version=7.1`
    );
    return response.data.value;
  }

  // Work Item History
  async getWorkItemRevisions(project: string, id: number): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/wit/workitems/${id}/revisions?api-version=7.1`
    );
    return response.data.value;
  }

  async getWorkItemComments(project: string, id: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${id}/comments?api-version=7.1-preview.4`;
    try {
      const response = await client.get(url);
      return response.data.comments || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  // Wikis
  async getWikis(project: string): Promise<any[]> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/wiki/wikis?api-version=7.1`
    );
    return response.data.value;
  }

  async getWiki(project: string, wikiIdentifier: string): Promise<any> {
    const client = await this.getClient();
    const response = await client.get(
      `/${project}/_apis/wiki/wikis/${wikiIdentifier}?api-version=7.1`
    );
    return response.data;
  }

  async listWikiPages(project: string, wikiIdentifier: string, path: string = '/'): Promise<any[]> {
    const client = await this.getClient();
    const encodedPath = encodeURIComponent(path);
    const response = await client.get(
      `/${project}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${encodedPath}&api-version=7.1`
    );
    return response.data.value || [];
  }

  async getWikiPageContent(
    project: string,
    wikiIdentifier: string,
    path: string = '/'
  ): Promise<string> {
    const client = await this.getClient();
    const encodedPath = encodeURIComponent(path);
    const response = await client.get(
      `/${project}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${encodedPath}&includeContent=true&api-version=7.1`
    );
    return response.data.content;
  }

  async createOrUpdateWikiPage(
    project: string,
    wikiIdentifier: string,
    path: string,
    content: string,
    comment?: string
  ): Promise<any> {
    const client = await this.getClient();
    const encodedPath = encodeURIComponent(path);
    const url = `/${project}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${encodedPath}&api-version=7.1`;
    const body = {
      content,
      ...(comment && { comment }),
    };
    const response = await client.put(url, body);
    return response.data;
  }

  // Test Plans
  async getTestPlans(project: string): Promise<any[]> {
    const client = await this.getClient();
    try {
      const response = await client.get(
        `/${project}/_apis/test/plans?api-version=7.1`
      );
      return response.data.value;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async createTestPlan(project: string, name: string, description?: string): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/plans?api-version=7.1`;
    const body = {
      name,
      description,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  async listTestSuites(project: string, planId: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/plans/${planId}/suites?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async createTestSuite(project: string, planId: number, name: string, suiteType: string = 'StaticTestSuite'): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/plans/${planId}/suites?api-version=7.1`;
    const body = {
      name,
      suiteType,
    };
    const response = await client.post(url, body);
    return response.data;
  }

  async addTestCasesToSuite(project: string, planId: number, suiteId: number, testCaseIds: number[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/plans/${planId}/suites/${suiteId}/testcases?api-version=7.1`;
    const body = testCaseIds.map(id => ({ id }));
    const response = await client.post(url, body);
    return response.data;
  }

  async listTestCases(project: string, planId: number, suiteId: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/plans/${planId}/suites/${suiteId}/testcases?api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  async createTestCase(project: string, title: string, steps?: any[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/$Test Case?api-version=7.1`;
    const patchDocument = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: title,
      },
    ];
    if (steps && steps.length > 0) {
      patchDocument.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.TCM.Steps',
        value: JSON.stringify(steps),
      });
    }
    const response = await client.post(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async updateTestCaseSteps(project: string, testCaseId: number, steps: any[]): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/wit/workitems/${testCaseId}?api-version=7.1`;
    const patchDocument = [
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.TCM.Steps',
        value: JSON.stringify(steps),
      },
    ];
    const response = await client.patch(url, patchDocument, {
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    return response.data;
  }

  async getTestResultsFromBuild(project: string, buildId: number): Promise<any[]> {
    const client = await this.getClient();
    const url = `/${project}/_apis/test/results?buildUri=vstfs:///Build/Build/${buildId}&api-version=7.1`;
    const response = await client.get(url);
    return response.data.value || [];
  }

  // Advanced Security
  async getAdvancedSecurityAlerts(
    project: string,
    repositoryId: string,
    severity?: string,
    state?: string,
    top: number = 100
  ): Promise<any[]> {
    const client = await this.getClient();
    let url = `/${project}/_apis/alert/repositories/${repositoryId}/alerts?api-version=7.1-preview.1&$top=${top}`;
    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    if (state) params.append('state', state);
    if (params.toString()) url += `&${params.toString()}`;
    
    try {
      const response = await client.get(url);
      return response.data.value || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async getAdvancedSecurityAlertDetails(
    project: string,
    repositoryId: string,
    alertId: string
  ): Promise<any> {
    const client = await this.getClient();
    const url = `/${project}/_apis/alert/repositories/${repositoryId}/alerts/${alertId}?api-version=7.1-preview.1`;
    
    try {
      const response = await client.get(url);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
