# Interface

Kusama Shield User interface

## Documentation:     
https://codeberg.org/KusamaShield/documentation/    


### Clone: 
```shell
git clone https://codeberg.org/KusamaShield/Interface && cd Interface/
```

### Install:

#### Build wasm packages: 
```shell
cargo install wasm-pack
wasm-pack build --target web
rm -rf public/pkg/
cp -r pkg/ public/
```

#### Install node packages:
```shell
npm install -f
```



### Run:  
```shell
npm run dev
```
### Test link:


### Screenshots:  
![](mainui.png)

## Tested on:  
Linux + Google Chrome + Talisman Browser Wallet


### Supported Chains:   
-  [x] 
-  [x] 
-  [x] 