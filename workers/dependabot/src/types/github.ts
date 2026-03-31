export interface DependabotAlertEvent {
  action: 'created' | 'dismissed' | 'fixed' | 'reintroduced' | 'reopened'
  alert: {
    number: number
    state: string
    html_url: string
    dependency: {
      package: {
        name: string
        ecosystem: string
      }
      manifest_path: string
    }
    security_advisory: {
      ghsa_id: string
      cve_id: string | null
      summary: string
      severity: 'low' | 'medium' | 'high' | 'critical'
    }
    security_vulnerability: {
      severity: 'low' | 'medium' | 'high' | 'critical'
      first_patched_version: { identifier: string } | null
      vulnerable_version_range: string
    }
  }
  repository: Repository
  organization?: { login: string }
  sender: { login: string }
}

export interface PullRequestEvent {
  action: 'opened' | 'closed' | 'synchronize' | 'reopened' | 'edited' | 'labeled' | 'unlabeled'
  number: number
  pull_request: {
    number: number
    html_url: string
    title: string
    body: string | null
    merged: boolean
    state: 'open' | 'closed'
    head: { ref: string; sha: string }
    base: { ref: string }
    user: { login: string }
    node_id: string
  }
  repository: Repository
  organization?: { login: string }
  sender: { login: string }
}

interface Repository {
  name: string
  full_name: string
  owner: { login: string }
}

export interface DependabotAlert {
  number: number
  state: string
  html_url: string
  dependency: {
    package: {
      name: string
      ecosystem: string
    }
    manifest_path: string
  }
  security_advisory: {
    ghsa_id: string
    cve_id: string | null
    summary: string
    severity: string
  }
  security_vulnerability: {
    severity: string
    first_patched_version: { identifier: string } | null
  }
}
