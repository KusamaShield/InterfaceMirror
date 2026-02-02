/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

mod utils;
use web_sys::js_sys::Uint8Array;

use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
mod zk;
use zk::{Posbn254, HashCircuit, generate_keys, generate_proof2, generate_params, generate_proof}; // generate_proof
use halo2_poseidon::poseidon::primitives::{ConstantLength, Hash};
use halo2_proofs::{
//    circuit::Value,
//    dev::{CellValue, MockProver},
    halo2curves::ff::{Field, PrimeField},
};
use halo2_solidity_verifier::Keccak256Transcript;
use std::panic;
//use rand_core::OsRng;
use rand::rngs::OsRng;
//use rand::rngs::OsRng;
use js_sys::WebAssembly;
use halo2_proofs::poly::kzg::multiopen::ProverSHPLONK;
use halo2_proofs::plonk::Circuit;
use halo2_proofs::plonk::create_proof;
use halo2_proofs::poly::kzg::commitment::KZGCommitmentScheme;
use halo2_proofs::transcript::TranscriptWriterBuffer;
use halo2_proofs::poly::kzg::commitment::ParamsKZG;
use std::io::Cursor;
use std::io::BufReader;
use halo2_proofs::plonk::ProvingKey;
use halo2_proofs::{
    halo2curves::bn256::{Bn256, Fr as Fp, G1Affine}};
use halo2_proofs::poly::commitment::Params;

// expose threadpool
pub use wasm_bindgen_rayon::init_thread_pool;



/*
async fn fetch_params(url: &str) -> Result<ParamsKZG<Bn256>, JsError> {
    // Use browser's fetch API
    let window = web_sys::window().ok_or_else(|| JsError::new("No window object"))?;
    let response = JsFuture::from(window.fetch_with_str(url)).await?;
    let response: web_sys::Response = response.dyn_into()?;
    
    let buffer = JsFuture::from(response.array_buffer()?).await.unwrap_or_else(|_| JsError::new("No buffer object"));
    let bytes = Uint8Array::new(&buffer).to_vec();

    // Deserialize params
    let mut cursor = std::io::Cursor::new(bytes);
    ParamsKZG::<Bn256>::read(&mut cursor)
        .map_err(|e| JsError::new(&format!("Params error: {}", e)))
}

*/

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from Rust, {}!", name)
}



const WIDTH: usize = 3;
const RATE: usize = 2;
const L: usize = 2;
const K: u32 = 8; // change me l8r

//const PRECOMPUTED_PARAMS: &[u8] = include_bytes!("./../proofs/hermez-raw-11");

// precomputed poseidon parameters
//const PARAMS_DATA: &[u8] = include_bytes!("../static/proofs/params.bin");





#[derive(Debug)]
pub enum ZkError {
    InvalidSecret,
    ParamsError(String),
    ProofError(String),
//    Erri,
}



impl From<ZkError> for JsValue {
    fn from(error: ZkError) -> Self {
        match error {
            ZkError::InvalidSecret => JsValue::from_str("Invalid secret - must be numeric"),
            ZkError::ParamsError(e) => JsValue::from_str(&format!("Params error: {}", e)),
            ZkError::ProofError(e) => JsValue::from_str(&format!("Proof error: {}", e)),
            //ZkError::Erri(e) => JsValue::from_str(&format!("Proof error: {}", e)),
        }
    }
}


#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    /*
    #[cfg(target_arch = "wasm32")]
    wasm_bindgen::__rt::set_table_size(8192).unwrap_or_else(|_| {
        web_sys::console::error_1(&"Failed to initialize WASM table".into());
    });

    // Pre-allocate table space
    wasm_bindgen::__rt::set_table_size(8192).unwrap_or_else(|_| {
        panic!("Failed to initialize WebAssembly table");
    });
    */
//    console_error_panic_hook::set_once();
}
/* */


#[wasm_bindgen]
pub fn generate_commitment(secret: &str) -> Result<String, JsError> {
    // Convert secret to field element safely
    let m2 = Fp::from_str_vartime(secret)
        .ok_or_else(|| JsError::new("Invalid secret - must be numeric"))?;

    // Create proper message array
    let msg = [m2, m2];  // Using same value twice (adjust if needed)
    
    // Generate hash
    let output = Hash::<_, Posbn254<3, 2>, ConstantLength<2>, 3, 2>::init()
        .hash(msg);
    let o2 = format!("{:?}", output);
    // Return hex-encoded result
    Ok(o2)
}

/* */


#[wasm_bindgen]
pub fn test_console() {
    web_sys::console::log_1(&"Simple test message".into());
//    js_sys::console::log(&"Starting proof generation j".into());

}

#[wasm_bindgen]
pub fn pdata(parambytes: Vec<u8>) -> Result<String, JsError> {
    let nullifier = Fp::from(0x456);
let secret = Fp::from(0x12345);
// the circuit should hash these values 
let mmessage = [secret, nullifier];
const K: u32 = 8;
const L: usize = 2;
let output =
    Hash::<_, Posbn254<WIDTH, RATE>, ConstantLength<L>, WIDTH, RATE>::init()
        .hash(mmessage);

        let circuit22 = HashCircuit::<Posbn254<WIDTH, RATE>, WIDTH, RATE, L>::new(mmessage);
      //  web_sys::console::log_1(&format!("Received params length: {}", params_vec.len()).into());
        //BufReader::new(&params_vec[..])
       // let params = ParamsKZG::<Bn256>::read(&mut BufReader::new(&params_vec[..]))?;
       
        //let mut reader = BufReader::new(parambytes);
        let params = ParamsKZG::<Bn256>::read(&mut BufReader::new(&parambytes[..]))?;
        let (pk, _vk) = generate_keys(&params, &circuit22)?;
       // let (pk, vk) = generate_keys(&params, &circuit22)?;
        let proof = generate_proof2(&params, &pk, circuit22, vec![vec![output]]).map_err(|e| JsError::new(&format!("Proof error: {}", e)))?;;

        Ok("proofo".to_string())
//        Ok(())
}

#[wasm_bindgen]
pub fn test_proofo(parambytes: JsValue) -> Result<String, JsError> {
    let memory = wasm_bindgen::memory()
    .dyn_into::<WebAssembly::Memory>()
    .unwrap();
web_sys::console::log_1(&format!("Memory: {} pages", memory.grow(0)).into());

    let params_vec = Uint8Array::new(&parambytes).to_vec();

    let p = pdata(params_vec);

        Ok("proofo".to_string())

}


#[wasm_bindgen]
pub async fn test_params() -> Result<String, JsError> {

    let mut reader = Cursor::new(fetch_srs(&"https://trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com/hermez-raw-11").await?);
    
    let params = ParamsKZG::<Bn256>::read(&mut reader)?;
    Ok("good".to_string())

} 


async fn fetch_srs(uri: &str) -> Result<Vec<u8>, JsError> {
    let client = reqwest::Client::new();
    // wasm doesn't require it to be mutable
    #[allow(unused_mut)]
    let mut resp = client.get(uri).body(vec![]).send().await?;
    let mut buf = vec![];
  /*
    while let Some(chunk) = resp.chunk().await? {
        buf.extend(chunk.to_vec());
    }
*/

    Ok(std::mem::take(&mut buf))
}

#[wasm_bindgen]
pub fn generate_proof_data(secret: &str, parambytes: JsValue) -> Result<String, JsError> {
    web_sys::console::log_1(&"generate_proof_data called".into());

    web_sys::console::log_1(&"generate_proof_data called 1".into());

    let m2 = Fp::from_str_vartime(secret)
        .ok_or_else(|| JsError::new("Invalid secret - must be numeric"))?;
        web_sys::console::log_1(&"generate_proof_data called 2".into());
    // Create proper message array
    let msg = [m2, m2];  // Using same value twice (adjust if needed)
    web_sys::console::log_1(&"generate_proof_data called 3".into());
    // Generate hash
    let output = Hash::<_, Posbn254<WIDTH, RATE>, ConstantLength<L>, WIDTH, RATE>::init()
        .hash(msg); 
        web_sys::console::log_1(&"generate_proof_data called 4".into());
            web_sys::console::log_1(&"Starting proof generation".into());
    let circuit = HashCircuit::<Posbn254<WIDTH, RATE>, WIDTH, RATE, L>::new(msg);
    web_sys::console::log_1(&"generate_proof_data called 5".into());
  let params_vec = Uint8Array::new(&parambytes).to_vec();
 web_sys::console::log_1(&format!("Received params length: {}", params_vec.len()).into());
 let params = match ParamsKZG::<Bn256>::read(&mut BufReader::new(&params_vec[..])) {
     Ok(p) => p,
     Err(e) => {
         web_sys::console::error_1(&format!("Params read error: {}", e).into());
         return Err(JsError::new(&format!("Params error: {}", e)));
     }
 };
 web_sys::console::log_1(&format!("Loaded params K: {}", params.k()).into());

     web_sys::console::log_1(&"Starting pk generation".into());
 let (pk, vk) = generate_keys(&params, &circuit)?;
 web_sys::console::log_1(&format!("Params size: {}", params.k()).into());
 web_sys::console::log_1(&"pk generation ok".into());
web_sys::console::log_1(&"Starting proof generation".into());


let memory = wasm_bindgen::memory()
.dyn_into::<WebAssembly::Memory>()
.map_err(|_| JsError::new("Failed to access WASM memory"))?;


  // Check and grow memory if needed
  let current_pages = memory.grow(0);
  if current_pages < 600 {  // If less than ~28MB allocated
      memory.grow(64); //.map_err(|_| JsError::new("Memory growth failed"))?
  }

   // Generate proof with memory management
   let proof = match std::panic::catch_unwind(|| {
    // Try to grow memory if needed
    web_sys::console::log_1(&format!(
        "Memory: {} pages ({}MB) allocated",
        memory.grow(0),
        (memory.grow(0) as f64 * 64.0) / 1024.0
    ).into());
    web_sys::console::log_1(&"calling generate proof!".into());
    generate_proof2(&params, &pk, circuit, vec![vec![output]])
}) {
    Ok(Ok(p)) => p,
    Ok(Err(e)) => return Err(JsError::new(&format!("Proof error: {}", e))),
    Err(_) => return Err(JsError::new("Proof generation panicked")),
};
web_sys::console::log_1(&format!("Proof raw length: {}", proof.len()).into());

//let proof = generate_proof(&params, &pk, circuit, vec![vec![output]]).map_err(|e| JsError::new(&format!("Proof generation failed: {}", e)))?;
web_sys::console::log_1(&"got proof!".into());
    
   // Ok(format!("Generated proof: {:?}", hex::encode(proof))) //hex::encode(output.to_repr()))
   Ok(proof) //proof
}


/*

pub fn quick_proof() -> String {

    let mut transcript: Keccak256Transcript<G1Affine, Vec<u8>> = Keccak256Transcript::new(vec![]);
    web_sys::console::log_1(&"transcript ok".into());
    let pubi = vec![vec![output]];
    let instances = &(pubi
        .iter()
        .map(|instance| instance.as_slice())
        .collect::<Vec<&[Fp]>>());
create_proof::<
KZGCommitmentScheme<Bn256>,
ProverSHPLONK<Bn256>,
_,
_,
Keccak256Transcript<G1Affine, Vec<u8>>,
_,
>(
&params,
&pk,
&[circuit],
&[instances],
OsRng,
&mut transcript,
)?;
web_sys::console::log_1(&"got proof 0!".into());
let proof = transcript.finalize();
    Ok(proof)
}
*/

/*

pub fn generate_proof_ext(
    params: &ParamsKZG<Bn256>,
    pk: &ProvingKey<G1Affine>,
    circuit: impl Circuit<Fp>,
    public_inputs: Vec<Vec<Fp>>,
) -> Result<Vec<u8>, JsError> {
    web_sys::console::log_1(&"Starting pk generation".into());

    let mut transcript = Keccak256Transcript::new(vec![]);
    web_sys::console::log_1(&"Starting pk generation".into());

    let instances = &(public_inputs
        .iter()
        .map(|instance| instance.as_slice())
        .collect::<Vec<&[Fp]>>());

    create_proof::<
        KZGCommitmentScheme<Bn256>,
        ProverSHPLONK<Bn256>,
        _,
        _,
        Keccak256Transcript<G1Affine, Vec<u8>>,
        _,
    >(
        &params,
        &pk,
        &[circuit],
        &[instances],
        OsRng,
        &mut transcript,
    )?;

    let proof = transcript.finalize();
    Ok(proof)
}

*/

#[cfg(test)] // This attribute means the module only compiles when running tests
mod tests {
    use super::*; // Import items from the parent module

    #[test] // Marks this function as a test
    fn test_add() {
        println!("testo");
        assert_eq!(add(2, 2), 4);
    }
}

