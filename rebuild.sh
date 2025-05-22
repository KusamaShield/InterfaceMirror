rm -rf pkg/ target/ node_modules/ public/pkg/
wasm-pack build --target web
cp -r pkg/ public/
npm install -f
npm run dev
