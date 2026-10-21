# Agent instructions

## ⭐ Session start: enable **ponytail** + **caveman** + **RTK** first

Every agent session in this workspace **starts** by enabling these plugins.
Do this before other work. Ponytail first (what you build), then caveman
(what you say), then RTK (shell output). Code, commands, and error strings stay exact.

1. **Ponytail** — lazy senior. Climb the ladder before writing code (`/ponytail`, default **full**). Stay on until `stop ponytail` / `normal mode`.
   - Plugin / skill: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
2. **Caveman** — terse chat. Read and follow the caveman skill (`/caveman`, default **full**). Stay on until the user says `stop caveman` / `normal mode`.
   - Plugin / skill: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)
3. **RTK (Rust Token Killer)** — compact bash output. Prefer `rtk <cmd>` (or the Cursor hook rewrite) for `git`, `ls`, `rg`/`grep`, tests, builds, logs. Prefer shell `cat`/`rg`/`find` (or `rtk read` / `rtk grep` / `rtk find`) over IDE Read/Grep/Glob when listing or searching so RTK can filter.
   - Plugin / CLI: [rtk-ai/rtk](https://github.com/rtk-ai/rtk)

If a plugin is missing, say so in one line and keep working. Do not skip this
step because the last turn already used them.


## Project principles (priority order)

**KISS is the primary OKR of the tech team.** Confirmed. If two designs both
work, ship the simpler, more readable one. Cleverness, extra layers, and
"future-proof" structure lose to obvious code.

When principles conflict: **KISS > DRY > SOLID**.

1. **KISS + readability + clean code** (first project law)
   - Small functions, obvious names, straight control flow.
   - A reader should understand the change without a tour.
   - No clever tricks, no speculative flexibility, no framework for one call site.
   - Names, types, and tests carry intent. Comment rules: **Comments** below.

2. **DRY**
   - Same logic, one owner: extract once.
   - Similar blocks that will diverge: leave them. Premature DRY is worse than duplication.

3. **SOLID** (after KISS and DRY; never a reason to add layers)
   - **S** — one reason to change. Split only when a type is already doing two jobs.
   - **O** — add a variant; do not edit a growing switch. Only when a second real variant exists.
   - **L** — subtype honors the parent contract. No surprising overrides.
   - **I** — callers must not depend on methods they ignore. No interface for one implementation.
   - **D** — use abstractions this codebase already has. Do not invent a port/adapter for one concrete.


## Language

If the user writes in Persian (or any language), **always reply in English**.

- Chat replies: English only. Never Persian.
- Docs, commit messages, PR text: English only.
- Code comments (when a comment is allowed): English only.
- Do not mix Persian into explanations, lists, or examples.

User input may stay Persian. Output must not.

## Comments

Default: **no new comments**. Names, types, and tests carry intent. Comment only when the code cannot.

### Do not add

- What the next line does (`// get user`, `// return result`, `// 1. collect IDs`)
- Restating the signature (Javadoc that repeats param names / "Retrieves X by ID")
- Change-log / authorship (`// added for autocomplete`, `// fix COMP-599`)
- Commented-out code
- TODOs unless the user asked
- Narrating a refactor you just did

```java
// ❌
// Declared before /{id} so autocomplete is not treated as an id
@GetMapping("/autocomplete")
public ResponseEntity<List<BaseInfoAutocompleteDto>> autocomplete(...) { ... }

// ❌
/** Retrieves a BaseInfo by its ID. */
public BaseInfoDto findById(String id) { ... }
```

### Add only if essential (Clean Code)

Comment **why / constraint / hazard**, never **what**:

- Invariant the compiler cannot enforce (routing trap, Oracle quirk, money rounding)
- Warning: do not "simplify", ordering matters, security
- Public contract that is not in the type (units, null = INTERNAL, max 50)
- Cite a ticket/spec only when a reader would otherwise "fix" the wrong thing

```java
// ✅ PathPattern: literal /autocomplete must win over /{id}
@GetMapping("/autocomplete")

// ✅ Omit / null / unknown source → INTERNAL; never require it
```

Keep it one short line. No essay.

### Existing comments

Sensitive: treat them as intentional.

- Do not delete or rewrite comments you did not need to touch
- Do not "improve" Javadoc while changing behavior
- If you remove the reason a comment existed, remove that comment in the same edit
- If a comment is now a lie, fix or delete it — do not leave it stale
