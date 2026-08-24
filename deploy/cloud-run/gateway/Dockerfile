FROM nginx:1.27-alpine

# The official Nginx image renders templates with environment variables at
# startup. Cloud Run injects PORT, so the gateway listens on the required port.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
