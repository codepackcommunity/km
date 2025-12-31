/** @type {import('next').NextConfig} */
const nextConfig = {
        // Disable all debugging
        reactStrictMode: true,
        // Disable specific debugging features
        compiler: {
            removeConsole: process.env.NODE_ENV === 'production'
        }
};

export default nextConfig;
