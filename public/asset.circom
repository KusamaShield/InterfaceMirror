pragma circom 2.2.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/mux1.circom";
include "node_modules/circomlib/circuits/bitify.circom";

template LeanIMTInclusionProof(maxDepth) {
    signal input leaf;
    signal input leafIndex;
    signal input siblings[maxDepth];

    signal output out;

    signal nodes[maxDepth + 1];
    signal indices[maxDepth];

    component indexToPath = Num2Bits(maxDepth);
    indexToPath.in <== leafIndex;
    indices <== indexToPath.out;

    nodes[0] <== leaf;

    // Declare arrays of components outside the loop
    component mux[maxDepth];
    component hasher[maxDepth];

    for (var i = 0; i < maxDepth; i++) {
        mux[i] = MultiMux1(2); // Initialize each component in the array
        mux[i].c[0][0] <== nodes[i];
        mux[i].c[0][1] <== siblings[i];
        mux[i].c[1][0] <== siblings[i];
        mux[i].c[1][1] <== nodes[i];
        mux[i].s <== indices[i];

        hasher[i] = Poseidon(2); // Initialize each component in the array
        hasher[i].inputs[0] <== mux[i].out[0];
        hasher[i].inputs[1] <== mux[i].out[1];
        
        nodes[i+1] <== hasher[i].out;
    }

    out <== nodes[maxDepth];
}

template Main() {
    // Private inputs
    signal input secret;
    signal input asset;
    signal input amount;
    signal input leafIndex;
    signal input siblings[256]; // Max depth 256
    
    // Public inputs (specified during withdrawal)
    signal input recipient;

    // Public outputs
    signal output root;
    signal output nullifier;
    signal output publicAsset;
    signal output publicAmount;
    signal output publicRecipient;
   // signal output reserved0;
 //   signal output reserved1;
 //   signal output reserved2; // <== 0; // New signal

    // Compute commitment = H(secret, asset, amount)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== asset;
    commitmentHasher.inputs[2] <== amount;

    // Compute nullifier = H(secret, 1)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== 1; // Domain separator

    // Verify Merkle inclusion
    component merkleProof = LeanIMTInclusionProof(256);
    merkleProof.leaf <== commitmentHasher.out;
    merkleProof.leafIndex <== leafIndex;
    for (var i = 0; i < 256; i++) {
        merkleProof.siblings[i] <== siblings[i];
    }

    // Public signal assignments
    root <== merkleProof.out;
    nullifier <== nullifierHasher.out;
    publicAsset <== asset;
    publicAmount <== amount;
    publicRecipient <== recipient; // Passed through from input
//    reserved0 <== 0;
//    reserved1 <== 0;
 //   reserved2 <== 0; // New signal
}

component main {public [recipient]} = Main();
