rm -rf site/dist site/.astro site/node_modules
npm --prefix site ci
npm --prefix site run build
npm --prefix site run preview -- --host 0.0.0.0 --port 4322