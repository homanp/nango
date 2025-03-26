import type { NangoAction } from '../../models';

/**
 * List issues from Linear with optional filtering
 * 
 * @param nango The Nango object
 * @param params Optional parameters for filtering issues
 * @param params.teamId Filter issues by team ID
 * @param params.projectId Filter issues by project ID
 * @param params.assigneeId Filter issues by assignee ID
 * @param params.status Filter issues by status name
 * @param params.limit Maximum number of issues to return (default: 50)
 * @returns A list of Linear issues matching the filters
 */
export default async function listIssues(
  nango: NangoAction,
  params: {
    teamId?: string;
    projectId?: string;
    assigneeId?: string;
    status?: string;
    limit?: number;
  } = {}
) {
  const limit = params.limit || 50;
  
  // Build filter conditions
  const filterConditions = [];
  
  if (params.teamId) {
    filterConditions.push(`team: { id: { eq: "${params.teamId}" } }`);
  }
  
  if (params.projectId) {
    filterConditions.push(`project: { id: { eq: "${params.projectId}" } }`);
  }
  
  if (params.assigneeId) {
    filterConditions.push(`assignee: { id: { eq: "${params.assigneeId}" } }`);
  }
  
  if (params.status) {
    filterConditions.push(`state: { name: { eq: "${params.status}" } }`);
  }
  
  // Construct the filter part of the query
  const filterParam = filterConditions.length > 0 
    ? `, filter: { ${filterConditions.join(', ')} }` 
    : '';

  const query = `
    query {
      issues(first: ${limit}${filterParam}) {
        nodes {
          id
          title
          description
          state {
            name
          }
          assignee {
            id
            name
            email
            displayName
          }
          creator {
            id
            name
            email
            displayName
          }
          team {
            id
            name
          }
          project {
            id
            name
          }
          createdAt
          updatedAt
          dueDate
          url
        }
      }
    }
  `;

  const response = await nango.post({
    baseUrlOverride: 'https://api.linear.app',
    endpoint: '/graphql',
    data: {
      query: query
    }
  });

  // Transform the response to a more user-friendly format
  const issues = response.data.data.issues.nodes.map((issue: any) => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    status: issue.state?.name,
    assignee: issue.assignee ? {
      id: issue.assignee.id,
      name: issue.assignee.displayName || issue.assignee.name,
      email: issue.assignee.email
    } : null,
    creator: issue.creator ? {
      id: issue.creator.id,
      name: issue.creator.displayName || issue.creator.name,
      email: issue.creator.email
    } : null,
    team: issue.team ? {
      id: issue.team.id,
      name: issue.team.name
    } : null,
    project: issue.project ? {
      id: issue.project.id,
      name: issue.project.name
    } : null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    dueDate: issue.dueDate,
    url: issue.url
  }));

  return {
    issues,
    count: issues.length
  };
}