import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ActivityItem } from '../types/activity';

type ActivityPanelProps = {
  activities: ActivityItem[];
  complete: boolean;
};

type ActivityGroup = {
  type: 'search-group';
  id: string;
  state: ActivityItem['state'];
  items: ActivityItem[];
};

type DisplayActivity = ActivityItem | ActivityGroup;

const metricLabels: Record<string, string> = {
  dimensions: 'dimensions',
  candidate_count: 'candidates',
  requested_candidates: 'requested',
  ranked_count: 'ranked',
  after_cutoff: 'after cutoff',
  after_deduplication: 'after dedup',
  selected_count: 'selected',
  cutoff: 'cutoff',
  query_count: 'queries',
  tool_calls: 'tool calls',
};

const NativeDetails: React.FC<{
  className: string;
  initialOpen: boolean;
  children: React.ReactNode;
}> = ({ className, initialOpen, children }) => {
  const [open, setOpen] = React.useState(initialOpen);

  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {children}
    </details>
  );
};

const formatDuration = (durationMs?: number): string => {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)} s`;
};

const formatMetric = ([key, value]: [string, unknown]): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? key.split('_').join(' ') : null;
  const label = metricLabels[key] ?? key.split('_').join(' ');
  return `${value} ${label}`;
};

const isActivityGroup = (activity: DisplayActivity): activity is ActivityGroup => (
  'type' in activity && activity.type === 'search-group'
);

const groupAgentActivities = (activities: ActivityItem[]): DisplayActivity[] => {
  const grouped: DisplayActivity[] = [];
  let searchGroup: ActivityGroup | null = null;

  const flushSearchGroup = () => {
    if (searchGroup) grouped.push(searchGroup);
    searchGroup = null;
  };

  for (const activity of activities) {
    if (activity.category === 'search' && activity.kind === 'tool') {
      if (!searchGroup) {
        searchGroup = {
          type: 'search-group',
          id: `search-group-${activity.id}`,
          state: activity.state,
          items: [],
        };
      }
      searchGroup.items.push(activity);
      if (activity.state === 'running') searchGroup.state = 'running';
      if (activity.state === 'error') searchGroup.state = 'error';
      continue;
    }
    flushSearchGroup();
    grouped.push(activity);
  }
  flushSearchGroup();
  return grouped;
};

const StateDot: React.FC<{ state: ActivityItem['state'] }> = ({ state }) => (
  <>
    <span className="thinking-state" aria-hidden="true"></span>
    <span className="sr-only">{state}</span>
    {state === 'error' && (
      <span className="activity-error-label">
        <span className="error-icon" aria-hidden="true">!</span>
        <span>Error</span>
      </span>
    )}
  </>
);

const Narration: React.FC<{ activity: ActivityItem }> = ({ activity }) => (
  <div className="activity-narration">
    {activity.agent && activity.agent !== 'MasterAgent' && (
      <span className="activity-narration-agent">{activity.agent}</span>
    )}
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{activity.content}</ReactMarkdown>
  </div>
);

const ActivityRow: React.FC<{ activity: ActivityItem }> = ({ activity }) => {
  const metrics = Object.entries(activity.metrics).map(formatMetric).filter(Boolean) as string[];
  const expandable = Boolean(activity.detail || activity.summary || metrics.length);
  const row = (
    <>
      <StateDot state={activity.state} />
      <span className="activity-tool-name">{activity.content}</span>
      {activity.kind === 'skill' && <span className="activity-kind-badge">Skill</span>}
      {activity.agent && <span className="activity-agent">{activity.agent}</span>}
    </>
  );

  if (!expandable) {
    return <div className={`activity-row ${activity.kind} ${activity.state}`}>{row}</div>;
  }

  return (
    <details className={`activity-tool ${activity.kind} ${activity.state}`}>
      <summary>{row}</summary>
      <div className="activity-detail-panel">
        {activity.summary && <div className="activity-summary">{activity.summary}</div>}
        {activity.detail && <pre className="thinking-detail">{activity.detail}</pre>}
        {metrics.length > 0 && (
          <div className="activity-metrics">
            {metrics.map(metric => <span key={metric}>{metric}</span>)}
          </div>
        )}
      </div>
    </details>
  );
};

const SearchGroup: React.FC<{ group: ActivityGroup }> = ({ group }) => (
  <details className={`activity-tool search-group ${group.state}`}>
    <summary>
      <StateDot state={group.state} />
      <span className="activity-tool-name">Searched table metadata</span>
      <span className="activity-group-count">{group.items.length} searches</span>
    </summary>
    <div className="activity-group-items">
      {group.items.map(item => (
        <div key={item.id} className="activity-group-item">
          <span>{item.detail || item.content}</span>
          <span>{item.state}</span>
        </div>
      ))}
    </div>
  </details>
);

const AgentActivity: React.FC<{
  activity: ActivityItem;
  children: ActivityItem[];
  allActivities: ActivityItem[];
}> = ({ activity, children, allActivities }) => {
  const displayed = groupAgentActivities(children);
  const actionCount = children.filter(child => child.kind !== 'narration').length;
  const skillCount = children.filter(child => child.kind === 'skill').length;
  const metricSummary = Object.entries(activity.metrics).map(formatMetric).filter(Boolean) as string[];
  const statusParts = [
    activity.summary,
    actionCount > 0 ? `${actionCount} actions` : null,
    skillCount > 0 ? `${skillCount} skills` : null,
    formatDuration(activity.durationMs) || null,
  ].filter(Boolean);

  return (
    <NativeDetails
      className={`agent-activity ${activity.state}`}
      initialOpen={activity.state === 'running'}
    >
      <summary className="agent-activity-summary">
        <StateDot state={activity.state} />
        <span className="agent-activity-name">{activity.content}</span>
        <span className="agent-activity-status">{statusParts.join(' · ')}</span>
      </summary>
      <div className="agent-activity-body">
        {activity.detail && <div className="agent-activity-task">{activity.detail}</div>}
        {displayed.map(item => isActivityGroup(item)
          ? <SearchGroup key={item.id} group={item} />
          : <ActivityNode key={item.id} activity={item} activities={allActivities} />)}
        {metricSummary.length > 0 && (
          <div className="agent-activity-metrics">
            {metricSummary.map(metric => <span key={metric}>{metric}</span>)}
          </div>
        )}
      </div>
    </NativeDetails>
  );
};

const ActivityNode: React.FC<{
  activity: ActivityItem;
  activities: ActivityItem[];
}> = ({ activity, activities }) => {
  if (activity.kind === 'narration') {
    return <Narration activity={activity} />;
  }
  if (activity.kind === 'agent') {
    return (
      <AgentActivity
        activity={activity}
        children={activities.filter(child => child.parentId === activity.id)}
        allActivities={activities}
      />
    );
  }
  return <ActivityRow activity={activity} />;
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ activities, complete }) => {
  const rootActivities = activities.filter(activity => !activity.parentId);
  const agentCount = activities.filter(
    activity => activity.kind === 'agent' && activity.category !== 'pipeline'
  ).length;
  const actionCount = activities.filter(activity => !['agent', 'narration'].includes(activity.kind)).length;
  const isRunning = activities.some(activity => activity.state === 'running');

  return (
    <NativeDetails
      className={`thinking-container ${isRunning ? 'active' : ''}`}
      initialOpen={!complete}
    >
      <summary className="thinking-toggle">
        <span className="thinking-icon">
          <span className="thinking-icon-collapsed">▶</span>
          <span className="thinking-icon-expanded">▼</span>
        </span>
        <span className="thinking-title">
          {isRunning ? '正在工作' : '工作过程'}
          <span className="thinking-count">
            {agentCount > 0 ? `${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}` : ''}
            {agentCount > 0 && actionCount > 0 ? ' · ' : ''}
            {actionCount > 0 ? `${actionCount} actions` : ''}
          </span>
        </span>
      </summary>
      <div className="thinking-content">
        {rootActivities.map(activity => (
          <ActivityNode key={activity.id} activity={activity} activities={activities} />
        ))}
      </div>
    </NativeDetails>
  );
};
