# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `orriborri/homelab`.
Use the `gh` CLI from this clone, or specify `--repo orriborri/homelab`.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --body-file <file>`
- Label: `gh issue edit <number> --add-label "<label>"`
- Remove label: `gh issue edit <number> --remove-label "<label>"`
- Close: `gh issue close <number> --comment "..."`

For multiline issue bodies and comments, write the exact text to a
temporary file and pass it with `--body-file`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Related tickets

Use native GitHub sub-issues for parent/child relationships when available.
Otherwise, put `Part of #<parent>` in the child body and link the child in
a task list in the parent.

Use native GitHub issue dependencies for blockers when available.
Otherwise, put `Blocked by: #<number>` in the ticket body.
A ticket is unblocked when every blocker is closed.

## Wayfinding

The map is one issue labelled `wayfinder:map`, containing Notes,
Decisions-so-far, and Fog. Link child tickets to the map and label each
`wayfinder:<type>`: research, prototype, grilling, or task.

Select the first open child in map order that has no open blockers and
no assignee. Claim it with `gh issue edit <number> --add-assignee @me`.
Resolve it by commenting with the answer, closing it, and adding a
summary and link to the map's Decisions-so-far.
