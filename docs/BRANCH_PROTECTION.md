# Branch and merge policy

`main` is the protected release branch. Work happens on `dev` or a short-lived feature branch and reaches `main` only through a pull request.

The checked-in policy is [.github/main-branch-protection.json](../.github/main-branch-protection.json). It requires:

- the `security` and `dependency-review` checks;
- one approving review, with stale approvals dismissed after new pushes;
- linear history and conversation resolution;
- administrator enforcement; and
- no force-pushes or branch deletion.

The GitHub repository setting is external state. An administrator can apply the file with:

```powershell
gh api --method PUT repos/jasperjjhe/cal-hacks-2026/branches/main/protection --input .github/main-branch-protection.json
```

The local `dev` branch is the default integration branch for this checkout. Push it once when the first implementation commit is ready:

```powershell
git push --set-upstream origin dev
```

Do not put provider credentials, wallet keys, Convex deploy keys, or Mana secrets in either branch. Use repository/environment secrets and short-lived OIDC credentials where the deployment platform supports them.
