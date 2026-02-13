/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://anytime.localhost:3000",
    "http://nuco.localhost:3000",
    "http://prismpay.localhost:3000",
    "http://artisio.localhost:3000",

    // only if you insist on .edge-lab.local
    "http://anytime.edge-lab.local:3000",
    "http://nuco.edge-lab.local:3000",
    "http://prismpay.edge-lab.local:3000",
    "http://artisio.edge-lab.local:3000"
  ],
};

module.exports = nextConfig;