/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

use halo2_solidity_verifier::{Keccak256Transcript, SolidityGenerator, BatchOpenScheme::Bdfg21};

use halo2_proofs::{
    halo2curves::bn256::{Bn256, Fr as Fp, G1Affine},
    plonk::{create_proof, keygen_pk, keygen_vk, ProvingKey, Circuit, VerifyingKey},
    poly::{
        commitment::Params,
        kzg::{
            commitment::{KZGCommitmentScheme, ParamsKZG},
            multiopen::ProverSHPLONK,
        },
    },
    transcript::TranscriptWriterBuffer,
    SerdeFormat,
};
use std::fs::File;
use rand::rngs::OsRng;
use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    plonk::{Advice, Column, ConstraintSystem, Error, Instance},
};

use  halo2_proofs::halo2curves::ff::Field;
use anyhow::{Result, anyhow};
use halo2_poseidon::poseidon::{
    primitives::{generate_constants, ConstantLength, Mds, Spec},
    Hash, Pow5Chip, Pow5Config,
};
use std::convert::TryInto;
use std::marker::PhantomData;
use wasm_bindgen::prelude::wasm_bindgen;



#[derive(Clone, Copy, Default)]
pub struct HashCircuit<S, const WIDTH: usize, const RATE: usize, const L: usize>
where
    S: Spec<Fp, WIDTH, RATE> + Clone + Copy,
{
    message: Value<[Fp; L]>,
    _spec: PhantomData<S>,
}

#[derive(Debug, Clone)]
pub struct MyConfig<const WIDTH: usize, const RATE: usize, const L: usize> {
    input: [Column<Advice>; L],
    expected: Column<Instance>,
    poseidon_config: Pow5Config<Fp, WIDTH, RATE>,
}

impl<S, const WIDTH: usize, const RATE: usize, const L: usize> HashCircuit<S, WIDTH, RATE, L>
where
    S: Spec<Fp, WIDTH, RATE> + Clone + Copy,
{
    pub fn new(message: [Fp; L]) -> Self {
        Self {
            message: Value::known(message),
            _spec: PhantomData,
        }
    }
}

impl<S, const WIDTH: usize, const RATE: usize, const L: usize> Circuit<Fp>
    for HashCircuit<S, WIDTH, RATE, L>
where
    S: Spec<Fp, WIDTH, RATE> + Copy + Clone,
{
    type Config = MyConfig<WIDTH, RATE, L>;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self {
            message: Value::unknown(),
            _spec: PhantomData,
        }
    }

    fn configure(meta: &mut ConstraintSystem<Fp>) -> Self::Config {
        let state = (0..WIDTH).map(|_| meta.advice_column()).collect::<Vec<_>>();
        let expected = meta.instance_column();
        meta.enable_equality(expected);
        let partial_sbox = meta.advice_column();

        let rc_a = (0..WIDTH).map(|_| meta.fixed_column()).collect::<Vec<_>>();
        let rc_b = (0..WIDTH).map(|_| meta.fixed_column()).collect::<Vec<_>>();

        meta.enable_constant(rc_b[0]);

        Self::Config {
            input: state[..RATE].try_into().unwrap(),
            expected,
            poseidon_config: Pow5Chip::configure::<S>(
                meta,
                state.try_into().unwrap(),
                partial_sbox,
                rc_a.try_into().unwrap(),
                rc_b.try_into().unwrap(),
            ),
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fp>,
    ) -> Result<(), Error> {
        let chip = Pow5Chip::construct(config.poseidon_config.clone());

        let message = layouter.assign_region(
            || "load message",
            |mut region| {
                let message_word = |i: usize| {
                    let value = self.message.map(|message_vals| message_vals[i]);
                    region.assign_advice(
                        || format!("load message_{}", i),
                        config.input[i],
                        0,
                        || value,
                    )
                };

                let message: Result<Vec<_>, Error> = (0..L).map(message_word).collect();
                Ok(message?.try_into().unwrap())
            },
        )?;

        let hasher = Hash::<_, _, S, ConstantLength<L>, WIDTH, RATE>::init(
            chip,
            layouter.namespace(|| "init"),
        )?;
        let output = hasher.hash(layouter.namespace(|| "hash"), message)?;

        layouter.constrain_instance(output.cell(), config.expected, 0)
    }
}


// Poseidon 
#[derive(Debug, Clone, Copy)]
pub struct Posbn254<const WIDTH: usize, const RATE: usize>;

impl<const WIDTH: usize, const RATE: usize> Spec<Fp, WIDTH, RATE> for Posbn254<WIDTH, RATE> {
    fn full_rounds() -> usize {
        8
    }

    fn partial_rounds() -> usize {
        56
    }

    fn sbox(val: Fp) -> Fp {
        val.pow_vartime(&[5])
    }

    fn secure_mds() -> usize {
        0
    }

    fn constants() -> (Vec<[Fp; WIDTH]>, Mds<Fp, WIDTH>, Mds<Fp, WIDTH>) {
        generate_constants::<_, Self, WIDTH, RATE>()
    }
}


pub fn generate_proof2(
    params: &ParamsKZG<Bn256>,
    pk: &ProvingKey<G1Affine>,
    circuit: impl Circuit<Fp>,
    public_inputs: Vec<Vec<Fp>>,
) -> Result<String> {
    let mut transcript = Keccak256Transcript::new(vec![]);
    let mut rng = rand::thread_rng();
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

    Ok(hex::encode(proof))
}



pub fn generate_proof(
    params: &ParamsKZG<Bn256>,
    pk: &ProvingKey<G1Affine>,
    circuit: impl Circuit<Fp>,
    public_inputs: Vec<Vec<Fp>>,
) -> Result<Vec<u8>> {
    let mut transcript = Keccak256Transcript::new(vec![]);
    let mut rng = rand::thread_rng();
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

use wasm_bindgen::JsError;


pub fn generate_keys(
    params: &ParamsKZG<Bn256>,
    circuit: &impl Circuit<Fp>,
) -> Result<(ProvingKey<G1Affine>, VerifyingKey<G1Affine>), JsError> {
    let vk = keygen_vk(params, circuit)
        .map_err(|e| JsError::new(&format!("VK error: {}", e)))?;
    let pk = keygen_pk(params, vk.clone(), circuit)
        .map_err(|e| JsError::new(&format!("PK error: {}", e)))?;
    Ok((pk, vk))
}
    


pub fn generate_params(
    k: u32,
    circuit: &impl Circuit<Fp>,
    ptau_path: Option<&[u8]>,
) -> Result<(
    ParamsKZG<Bn256>,
    ProvingKey<G1Affine>,
    VerifyingKey<G1Affine>,
)> {
    let mut rng = rand::thread_rng();
    let params = match ptau_path {
        
        Some(bytes) => {
            let mut cursor = std::io::Cursor::new(bytes);
            let mut p = ParamsKZG::<Bn256>::read(&mut cursor)?;

            if p.k() < k {
                return Err(anyhow!("ptau error: k is too large. max k: {}", p.k()));
            }
            if p.k() > k {
                p.downsize(k);
            }
            p
        }
        None => ParamsKZG::<Bn256>::setup(k, rng),
    };
    let vk = keygen_vk(&params, circuit)?;
    let pk = keygen_pk(&params, vk.clone(), circuit)?;

    Ok((params, pk, vk))
}