/**
 * Sub-navigation for the lifecycle preview.
 *
 * Lives here rather than in the layout because a route file may only export
 * the conventions Next recognises — a stray export from layout.tsx is a build
 * error, not a helper.
 */
export const PREVIEW_NAV = [
  { href: "/preview", label: "Lifecycle" },
  { href: "/preview/readiness", label: "Readiness" },
  { href: "/preview/discovery", label: "Discovery" },
  { href: "/preview/qualification", label: "Qualification" },
  { href: "/preview/bid-workspace", label: "Bid workspace" },
  { href: "/preview/pricing", label: "Pricing" },
  { href: "/preview/submission", label: "Submission" },
  { href: "/preview/intelligence", label: "Intelligence" },
];
