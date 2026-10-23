import { createFileRoute, redirect } from "@tanstack/react-router"

// The landing page moved to "/". Keep old /home links working.
export const Route = createFileRoute("/home")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/", hash: location.hash, statusCode: 301 })
  },
})
