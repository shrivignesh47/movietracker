# ============================================
# MovieTracker - Single Container (Frontend Only)
# Backend logic runs on Supabase Edge Functions
# Frontend is built locally, then served by nginx
# ============================================

FROM nginx:alpine

COPY frontend/dist /usr/share/nginx/html

# Nginx config for SPA routing + API proxy to Supabase Edge Functions
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
