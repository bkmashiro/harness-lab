import type {Lane,TraceEvent} from './contracts';
export type UnitId='introduction'|'proposal'|'dispatch'|'result'|'exercise'|'assessment';
export type LessonBlock=
 | {kind:'paragraph';text:string}
 | {kind:'code';language:'json'|'typescript';code:string;caption:string;source?:{label:string;url:string}}
 | {kind:'fields';items:{name:string;meaning:string;example?:string}[]}
 | {kind:'callout';title:string;text:string};
export interface QuizQuestion {id:string;prompt:string;choices:{id:string;text:string}[];answer:string;explanation:string;reviewUnit:UnitId;}
export interface LearningUnit {id:UnitId;title:string;goal:string;focus:Lane[];blocks:LessonBlock[];}
export interface LearningModule {id:string;title:string;description:string;objectives:string[];prerequisites:string[];units:LearningUnit[];questions:QuizQuestion[];summary:string[];}
export interface LessonScene {unitId:UnitId;events:TraceEvent[];preferredId:string|null;focus:Lane[];allEvents?:TraceEvent[];}
