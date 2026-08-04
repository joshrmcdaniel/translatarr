import { getSessionUser } from "../../lib/auth";
import { logged } from "../../lib/request-log";

const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Translatarr API</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
      });
    </script>
  </body>
</html>
`;

async function handleGET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const GET = logged(handleGET);
