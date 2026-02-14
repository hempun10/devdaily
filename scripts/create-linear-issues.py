#!/usr/bin/env python3
"""Create 5 Linear issues for devdaily standup testing."""

import json
import os
import sys
import urllib.request

API_KEY = os.environ.get("LINEAR_API_KEY", "")
TEAM_KEY = os.environ.get("LINEAR_TEAM_KEY", "")

if not API_KEY:
    print("ERROR: LINEAR_API_KEY env var is required.", file=sys.stderr)
    print("  Get one from https://linear.app/settings/api", file=sys.stderr)
    print("  Usage: LINEAR_API_KEY=lin_api_... LINEAR_TEAM_KEY=ENG python3 scripts/create-linear-issues.py", file=sys.stderr)
    sys.exit(1)

if not TEAM_KEY:
    print("ERROR: LINEAR_TEAM_KEY env var is required (e.g., ENG, DEV, HEM).", file=sys.stderr)
    sys.exit(1)

TICKETS = [
    (
        "Fix login page crash on mobile Safari",
        "The login form throws an unhandled exception on iOS Safari 17 when the password field gains focus. Stack trace points to an event listener on the autofill overlay.",
    ),
    (
        "Add dark mode toggle to settings page",
        "Users should be able to switch between light and dark mode from the settings panel. The toggle should persist preference to localStorage and apply the theme immediately without a page reload.",
    ),
    (
        "Refactor user service to use repository pattern",
        "The UserService currently has direct database calls mixed with business logic. Extract data access into a UserRepository class to improve testability and separation of concerns.",
    ),
    (
        "API rate limiting returns wrong HTTP status code",
        "When rate limit is exceeded the API returns 500 instead of 429 Too Many Requests. The error response body also lacks the Retry-After header.",
    ),
    (
        "Add export to CSV for dashboard reports",
        "Product wants users to be able to export the analytics dashboard data as CSV. Should support date range filtering and column selection.",
    ),
]


def graphql(query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": API_KEY,
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_team_id():
    data = graphql(
        '{ teams(filter: { key: { eq: "%s" } }) { nodes { id name key } } }' % TEAM_KEY
    )
    nodes = data.get("data", {}).get("teams", {}).get("nodes", [])
    if not nodes:
        print(f"ERROR: No team found with key '{TEAM_KEY}'", file=sys.stderr)
        # List available teams
        all_teams = graphql("{ teams { nodes { key name } } }")
        for t in all_teams.get("data", {}).get("teams", {}).get("nodes", []):
            print(f"  Available: {t['key']} - {t['name']}", file=sys.stderr)
        sys.exit(1)
    return nodes[0]["id"], nodes[0]["name"]


def create_issue(team_id, title, description):
    query = """
    mutation CreateIssue($teamId: String!, $title: String!, $description: String!) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        success
        issue { id identifier title url }
      }
    }
    """
    data = graphql(query, {"teamId": team_id, "title": title, "description": description})
    issue = data.get("data", {}).get("issueCreate", {}).get("issue", {})
    return issue.get("identifier", ""), issue.get("url", "")


def main():
    print("=" * 60)
    print("  Linear Issue Creator for DevDaily Testing")
    print("=" * 60)
    print()

    team_id, team_name = get_team_id()
    print(f"✓ Team: {TEAM_KEY} ({team_name})")
    print()

    identifiers = []
    for title, desc in TICKETS:
        identifier, url = create_issue(team_id, title, desc)
        if identifier:
            identifiers.append(identifier)
            print(f"✓ {identifier}: {title}")
            print(f"  {url}")
        else:
            identifiers.append("")
            print(f"✗ Failed: {title}")
        print()

    print("=" * 60)
    print("  Created Issues:")
    print("=" * 60)
    for ident in identifiers:
        if ident:
            print(f"  {ident}")
    print()
    print("Linear issue IDs (space-separated for use in other scripts):")
    print(" ".join(i for i in identifiers if i))


if __name__ == "__main__":
    main()
