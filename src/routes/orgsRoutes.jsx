// src/routes/orgsRoutes.jsx
import Organizations from "@/pages/Organizations";
import Members from "@/pages/Members";
import Invitations from "@/pages/Invitations";
import AcceptInvite from "@/pages/AcceptInvite";

export const orgsRoutes = [
  { path: "/orgs", element: <Organizations /> },
  { path: "/orgs/:orgId/members", element: <Members /> },
  { path: "/orgs/:orgId/invitations", element: <Invitations /> },
  { path: "/accept-invite/:token", element: <AcceptInvite /> },
];
