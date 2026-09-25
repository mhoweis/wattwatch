import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WattWatch — AI energy bill investigator",
    short_name: "WattWatch",
    description: "Turns DEWA electricity bills into prioritised, evidence-backed savings actions.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#fbbf24",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
