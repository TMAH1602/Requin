export type ContactKind = "schottky" | "ohmic" | "zero_field";
export interface Layer { name:string; material:string; thickness_nm:number; alloy_fraction:number|null; donors_cm3:number; acceptors_cm3:number; sheet_charge_cm2:number; mesh_spacing_nm:number|null }
export interface Contact { kind:ContactKind; barrier_ev:number; voltage_v:number }
export interface Project { schema_version:number; name:string; description:string; temperature_k:number; mesh_spacing_nm:number; fully_ionized:boolean; layers:Layer[]; surface:Contact; substrate:Contact; quantum:{start_nm:number;stop_nm:number;states:number}|null; sweep:{enabled:boolean;start_v:number;stop_v:number;step_v:number}; solver:{max_iterations:number;tolerance:number;mixing:number;preview_scale:number} }
export interface Eigenstate { index:number; energy_ev:number; wavefunction:number[] }
export interface Result { position_nm:number[]; potential_v:number[]; electric_field_v_cm:number[]; conduction_band_ev:number[]; valence_band_ev:number[]; electron_cm3:number[]; hole_cm3:number[]; net_charge_cm3:number[]; material:string[]; eigenstates:Eigenstate[]; sweep:{voltage_v:number;charge_c_m2:number;capacitance_f_m2:number|null;current_a_m2:number|null}[]; convergence:{converged:boolean;iterations:number;residual:number;quality:"preview"|"full";warnings:string[]} }

