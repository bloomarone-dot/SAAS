/**
 * Application SaaS authentifiée.
 * Le shell (session, layout, renderContent) reste dans App.jsx pour migration progressive.
 * Ce module expose le contrat de routes /app/*.
 */
export {
  APP_PREFIX,
  routePrefix,
  pathForView,
  viewFromPath,
  pushAppRoute,
  isAuthenticatedAppPath,
} from "@/apps/dashboard/routing";
