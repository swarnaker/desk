import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LINE",
    short_name: "LINE",
    description: "Signal-only launchpad radar for Pons, o1, Base, and Pump.",
    start_url: "/login",
    display: "standalone",
    theme_color: "#07080B",
    background_color: "#07080B",
    icons: [
      {
        src: "/icon-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
