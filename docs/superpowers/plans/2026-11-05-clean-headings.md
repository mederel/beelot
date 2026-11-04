# Clean headings on the felt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Headings and subtitles on the felt show no ghosted text and are not clipped.

**Architecture:** One override block at the end of `static/styles.css` plus a `--text-outline-thin` token.

**Tech Stack:** CSS, Node's test runner reading the stylesheet.

**Spec:** `docs/superpowers/specs/2026-11-05-clean-headings-design.md`

## Global Constraints

- CSS only; no new text; effects levels unaffected.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR title `fix: clean headings on the felt (US-111)`.

## Review Focus

- The home hero keeps its look and the first mode card stays above the fold at 375×667.
- A heading that wraps to three lines at the largest text size is not clipped.
- All four themes keep the outlined white text legible.

---

### Task 1: Headings and small text

**Files:** Modify `static/styles.css`; Test `frontend-tests/clean-headings.test.cjs`.

- [ ] **Step 1:** Tests per the spec. **Step 2:** run `node --test crates/beelot-server/frontend-tests`; expect failures. **Step 3:** add the token and the override block. **Step 4:** pass.
- [ ] **Step 5:** Browser at 375 px, four themes, normal and 24 px root text: headings of the setup, bidding, play, rules and tutorial views show no ghost and no clipping; home fold unchanged.
- [ ] **Step 6:** `cargo fmt --check`, clippy, `cargo test --workspace`; commit.
