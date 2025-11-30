import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173, allowedHosts: ["9b62bec2508b.ngrok-free.app"]
    }
});