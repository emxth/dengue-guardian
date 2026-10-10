# Data Generator for synthetic PHI historical intervention dataset

import pandas as pd
import numpy as np
import os

def generate_synthetic_data(num_records=2000):
    np.random.seed(42)
    
    # 1. Environmental & Contextual Features
    temperature = np.random.uniform(24.0, 35.0, num_records)
    rainfall = np.random.uniform(0.0, 150.0, num_records)
    mosquito_density = np.random.uniform(10, 100, num_records)
    breeding_sites = np.random.randint(0, 50, num_records)
    
    # 2. Intervention Actions (Tier 1 & Tier 2)
    tier_1_actions = ['Source Reduction', 'Larviciding', 'Adulticiding (Fogging)']
    tier_2_chemicals = ['None', 'Temephos (Abate)', 'Malathion', 'Deltamethrin']
    
    applied_macro = np.random.choice(tier_1_actions, num_records)
    applied_micro = []
    
    # NDCU Logic Simulation for Chemical Application
    for action in applied_macro:
        if action == 'Source Reduction':
            applied_micro.append('None')
        elif action == 'Larviciding':
            applied_micro.append('Temephos (Abate)')
        else:
            applied_micro.append(np.random.choice(['Malathion', 'Deltamethrin']))
            
    # 3. Calculate Simulated Effectiveness Score (Target Variable)
    # This creates a logical pattern for the ML model to learn
    effectiveness = []
    for i in range(num_records):
        score = 50 # Base score
        
        # Heavy rain washes away fogging/chemicals
        if rainfall[i] > 50 and applied_macro[i] != 'Source Reduction':
            score -= 20
            
        # Source reduction is highly effective when there are many breeding sites
        if applied_macro[i] == 'Source Reduction' and breeding_sites[i] > 20:
            score += 25
            
        # Fogging is effective for high adult density
        if applied_macro[i] == 'Adulticiding (Fogging)' and mosquito_density[i] > 60:
            score += 20
            
        # Add some random noise
        score += np.random.normal(0, 5)
        
        # Cap between 0 and 100
        effectiveness.append(max(0, min(100, score)))

    # 4. Compile into DataFrame
    df = pd.DataFrame({
        'temperature': temperature,
        'rainfall': rainfall,
        'mosquito_density': mosquito_density,
        'breeding_sites_count': breeding_sites,
        'tier_1_macro': applied_macro,
        'tier_2_micro': applied_micro,
        'effectiveness_score': effectiveness
    })
    
    return df

if __name__ == "__main__":
    print("Generating synthetic PHI intervention data...")
    df = generate_synthetic_data(2000)
    
    # Ensure directory exists
    output_dir = "../data/synthetic"
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, "phi_intervention_benchmark.csv")
    df.to_csv(output_path, index=False)
    
    print(f"Success! {len(df)} records saved to {output_path}")
    print(df.head())