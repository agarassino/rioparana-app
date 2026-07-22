FROM nginx:1.27-alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY privacy-policy.html /usr/share/nginx/html/privacy-policy.html
COPY leaflet.css /usr/share/nginx/html/leaflet.css
COPY leaflet.js /usr/share/nginx/html/leaflet.js
COPY leaflet.markercluster.js /usr/share/nginx/html/leaflet.markercluster.js
COPY MarkerCluster.css /usr/share/nginx/html/MarkerCluster.css
COPY MarkerCluster.Default.css /usr/share/nginx/html/MarkerCluster.Default.css
COPY parana-map.geojson /usr/share/nginx/html/parana-map.geojson
COPY guias /usr/share/nginx/html/guias
EXPOSE 80
