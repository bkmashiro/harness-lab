export type BuilderId='messages'|'provider'|'tools'|'dispatch'|'loop'|'workspace'|'failures'|'limits'|'real-api';
export interface BuilderBlock { kind:'text'|'code'|'note'; text:string; language?:'javascript'|'json'; title?:string; }
export interface BuilderLesson { id:BuilderId; title:string; goal:string; objectives:string[]; blocks:BuilderBlock[]; task:string; starter:string; solution:string; checks:{id:string;label:string}[]; review:string[]; }
export interface BuilderEvent {seq:number;type:string;data:unknown;source?:'runtime'|'learner';}
export interface BuilderResult {status:'completed'|'error'|'timeout'|'cancelled';value?:unknown;events:BuilderEvent[];files:Record<string,string>;error?:string;}
export interface BuilderHandle {result:Promise<BuilderResult>;cancel:()=>void;}
export interface BuilderCheck {id:string;label:string;passed:boolean;detail:string;}
/** Browser scripts define async function main(ctx). No key or host storage enters ctx. */
export interface BuilderRunInput {code:string;scenario?:'repair'|'invalid-args'|'unknown-tool'|'endless';timeoutMs?:number;abortAfterRequests?:number;}
