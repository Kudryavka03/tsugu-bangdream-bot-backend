import * as fs from 'fs';
import { fuzzySearchPath } from '@/config';
import { isInteger } from '@/routers/utils';
import { logger } from './logger';
import { parentPort, threadId, isMainThread } from 'worker_threads';
if (!isMainThread && parentPort) {
  loadConfig()
  console.log = (...args) => {
    parentPort.postMessage({
      type: 'log',
      threadId,
      args,
    });
  };
}
const isWorker = !isMainThread

interface FuzzySearchConfig {
  [type: string]: { [key: string]: (string | number | (string | number)[] | Record<string, unknown>)[] };
}

function loadConfig(): FuzzySearchConfig {
  const fileContent = fs.readFileSync(fuzzySearchPath, 'utf-8');
  logger('fuzzySearch', 'loaded fuzzy search config');
  return JSON.parse(fileContent);
}

export function manualLoadFuzzyConfig() {
  if (config != undefined) {
    config = loadConfig();
    cardSearchAliases = getCardSearchAliases(config);
  }
}

function extractLvNumber(str: string): number | null {
  const regex = /^lv(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

function extractNoteNumber(str: string): number | null {
  const regex = /^(?:nt|note)(?:s)?(\d+(?:\s*\+\s*\d+)*)$/i;
  const match = str.match(regex);
  if (!match) return null;

  let total = 0;
  for (const term of match[1].split('+')) {
    const value = Number(term.trim());
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value)) {
      return null;
    }
    total += value;
  }
  return total;
}

function combineNoteExpressionTokens(tokens: string[]): string[] {
  const combined: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    let token = tokens[index];
    if (/^(?:nt|note)(?:s)?\d/i.test(token)) {
      // Keep spaced additions together so an incomplete expression cannot become
      // a valid note filter for only its first term. Other filters stay separate.
      while (index + 1 < tokens.length) {
        const next = tokens[index + 1];
        if (!next.startsWith('+') && !(token.trimEnd().endsWith('+') && /^\d/.test(next))) {
          break;
        }
        token += ' ' + next;
        index++;
      }
    }
    combined.push(token);
  }
  return combined;
}

function extractSkillNumber(str: string): number | null {
  const regex = /^(?:sk|skill)(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

export let config: FuzzySearchConfig = loadConfig();
let cardSearchAliases = getCardSearchAliases(config);

function getCardSearchAliases(settings: FuzzySearchConfig) {
  const types = ['rarity', 'attribute', 'characterId', 'bandId', 'type', 'skillType', 'scoreUpMaxValue'];
  const aliases = new Set<string>();
  for (const type of types) {
    for (const values of Object.values(settings[type] ?? {})) {
      for (const value of values) {
        const entries = typeof value === 'string' ? [value]
          : Array.isArray(value) ? value
          : typeof value === 'object' && value !== null ? Object.keys(value) : [];
        for (const alias of entries) {
          if (typeof alias === 'string' && alias && !/\s/.test(alias)) aliases.add(alias);
        }
      }
    }
  }
  const lengths = [...new Set([...aliases].map(alias => alias.length))].sort((a, b) => b - a);
  return { aliases, lengths };
}

function splitCardKeyword(token: string): string[] {
  const keyword = token.toLowerCase();
  const { aliases, lengths } = cardSearchAliases;
  if (aliases.has(keyword) || isInteger(keyword)) return [token];

  // Only split when every part is a configured alias. Prefer the longest viable alias at each position.
  const next = new Array<number>(keyword.length + 1);
  next[keyword.length] = keyword.length;
  for (let start = keyword.length - 1; start >= 0; start--) {
    for (const length of lengths) {
      const end = start + length;
      if (next[end] !== undefined && aliases.has(keyword.slice(start, end))) {
        next[start] = end;
        break;
      }
    }
  }
  if (next[0] === undefined) return [token];

  const parts: string[] = [];
  for (let start = 0; start < keyword.length; start = next[start]) {
    parts.push(keyword.slice(start, next[start]));
  }
  return parts;
}

export interface FuzzySearchResult {
  [key: string]: (string | number)[];
}

// 自定义验证函数
export function isFuzzySearchResult(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.values(value).every(
    (arr) =>
      Array.isArray(arr) &&
      arr.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}

// 条件符贴着前一个词时补一个空格，只补最后一个，所有走分词的指令共用。
const conditionOperator = /<=|>=|==|＞＝|＜＝|＞=|＜=|[<>＜＞=＝≥≤]/g;

export function insertSpaceBeforeLastCondition(input: string): string {
  conditionOperator.lastIndex = 0;
  let lastIndex = -1;
  let found: RegExpExecArray | null;
  while ((found = conditionOperator.exec(input)) !== null) lastIndex = found.index;
  if (lastIndex <= 0 || /\s/.test(input.charAt(lastIndex - 1))) return input;
  return input.slice(0, lastIndex) + ' ' + input.slice(lastIndex);
}

export function fuzzySearch(keyword: string, splitCardKeywords = false): FuzzySearchResult {
  keyword = insertSpaceBeforeLastCondition(keyword);
  //兼容引号
  const tokens = [...keyword.matchAll(/["“”『』「」]([^"“”『』「」]+)["“”『』「」]|\S+/g)];
  const keywordList = combineNoteExpressionTokens(tokens.flatMap(([raw, quoted]) => {
    const token = raw.replace(/^["“”『』「」]|["“”『』「」]$/g, '');
    return splitCardKeywords && !quoted ? splitCardKeyword(token) : [token];
  }));

  console.log(keywordList)
  const matches: { [key: string]: (string | number)[] } = {};

  for (var keyword_org of keywordList) {
    let matched = false;
    let keyword = keyword_org.toLowerCase();

    if (!matches['_all']) {
      matches['_all'] = [keyword];
    }
    else {
      matches['_all'][0] += ' ' + keyword
    }

    if (isInteger(keyword)) {
      const num = parseInt(keyword, 10);
      if (!matches['_number']) {
        matches['_number'] = [];
      }
      matches['_number'].push(num);
      continue;
    }

    keyword = keyword.replace(/&gt;/g, '>');
    keyword = keyword.replace(/&lt;/g, '<');
    keyword = keyword.replace(/＞/g, '>');
    keyword = keyword.replace(/＜/g, '<');
    keyword = keyword.replace(/＝/g, '=');
    keyword = keyword.replace(/≥/g, '>=');
    keyword = keyword.replace(/≤/g, '<=');

    const lvNumber = extractLvNumber(keyword);
    if (lvNumber !== null) {
      if (!matches['songLevels']) {
        matches['songLevels'] = [];
      }
      matches['songLevels'].push(lvNumber);
      continue;
    }

    const noteNumber = extractNoteNumber(keyword);
    if (noteNumber !== null) {
      if (!matches['notes']) {
        matches['notes'] = [];
      }
      matches['notes'].push(noteNumber);
      continue;
    }
    const skillNumber = extractSkillNumber(keyword);
    if (skillNumber !== null) {
      if (!matches['scoreUpMaxValue']) {
        matches['scoreUpMaxValue'] = [];
      }
      matches['scoreUpMaxValue'].push(skillNumber);
      continue;
    }

    if (isValidRelationStr(keyword)) {
      if (!matches['_relationStr']) {
        matches['_relationStr'] = [];
      }
      matches['_relationStr'].push(keyword);
      continue;
    }

    for (const type in config) {
      const typeConfig = config[type];
      for (const key in typeConfig) {
        const values = typeConfig[key];
        for (const value of values) {
          if (typeof value === 'string') {
            if (value === keyword) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (Array.isArray(value)) {
            if (value.includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (typeof value === 'object' && value !== null) {
            if (Object.keys(value).includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }
        }
      }
    }

  }
  console.log(matches + ' fuzzySearch Line178')
  return matches;
}

function isValidRelationStr(_relationStr: string): boolean {
  const comparisonPattern = /^(?:<=|>=|==|=|<|>)\d+$/;
  const rangePattern = /^\d+-\d+$/;

  return comparisonPattern.test(_relationStr) || rangePattern.test(_relationStr);
}

export function include(source: string, target: string, allowShortTitlePrefix = false) {
  source = source.toLowerCase()
  return (allowShortTitlePrefix && /^[a-z]{3}$/.test(target) && source.startsWith(target))
  || source.includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 3)
  || source.split(' ').includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 1)
  || source.split('-').includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 1)
  || source == target
}

export function match(matches: FuzzySearchResult, target: any, numberTypeKey: string[],disableBandCharaIdLimit = false): boolean {
  if (!target) {
    return false;
  }
  let match;
  let haveAttrFlags = false;
  //if(isWorker) loadConfig()
  for (var key in matches) {
    if (key === 'attribute') haveAttrFlags = true
    if (key === '_number' || key === '_all') {
      continue;
    }
    if (match == undefined) match = false
    if (key === '_relationStr') {match = true; continue}
    // 匹配关键词
    if (target[key] !== undefined) {
      // 处理 Array 类型
      if (Array.isArray(target[key]) || typeof target[key] === 'object') {
        let matchArray = false;
        for (let i = 0; i < target[key].length; i++) {
          const element = target[key][i];

          // 对比字符串（忽略大小写）
          if (
            typeof element === 'string' &&
            matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === element.toLowerCase())
          ) {
            matchArray = true;
            break;
          }

          // 对比数字（songLevels 等）
          if (
            typeof element === 'number' &&
            matches[key].some((m: any) => typeof m === 'number' && m === element)
          ) {
            matchArray = true;
            break;
          }
        }
        if (matchArray) {
          match = true;
          continue;
        } else {
          match = false;
          break;
        }
      }
      // 处理 Object (string, number) 类型
      else {
        if (
          typeof target[key] === 'string' &&
          matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === target[key].toLowerCase())
        ) {
          match = true;
          continue;
        }

        if (
          typeof target[key] === 'number' &&
          matches[key].some((m: any) => typeof m === 'number' && m === target[key])
        ) {
          match = true;
          continue;
        }

        match = false;
        break;
      }
    }
  }
    if (match == undefined) match = false
    // 处理指定的数字类型 key，比如 songLevels
    if (!match && numberTypeKey.length > 0 && matches['_number'] !== undefined) {
      for (let key of numberTypeKey) {
        if (matches['_number'].includes(target[key])) {
          match = true;
          break
        }
      }
    }
    if(!match){
      for(let key in matches){
        if (key == 'notes'){
          for(let n in target.notes){
            if(matches[key][0] == target.notes[n]){
              match = true
              break
            }
          }
        }
      }
    }


  //如果在config中所有类型都不符合的情况下，检查 _all
  
  disableBandCharaIdLimit = disableBandCharaIdLimit || matches['fuzzySearchPolicy']?.includes('disableBandCharaIdLimit')  // 检查fuzzySearchPolicy，是否需要禁用bandId与CharacterId限定检查
  if (!match && matches['_all'] && (disableBandCharaIdLimit ||  (!matches['bandId'] && !matches['characterId']))) { 
    for (let i = 0; i < matches['_all'].length; i++) {
      let matchValue = (matches['_all'][i] as string).toLowerCase();
      let matchValueReplaceSpace = matchValue.replace(/ /g, '');
      for (let key in target) {
        if (key != 'musicTitle' && key != 'nickname' && key != 'prefix' && !key.endsWith('Name'))
          continue
        if (typeof target[key] === 'string') {
          if (key == 'nickname') {
            let nicknames = target[key].split(',')
            for (let nickname of nicknames) {
              if (haveAttrFlags && target['eventId']) break; // 对于活动而言，如果拥有属性，则不再查询nickname
              if (include(nickname, matchValue)) {
                match = true;
                break;
              }
              /*
              else{ // 如果仍然没有匹配到，则尝试拆分空格匹配，不考虑将其作为增量查找结果，因为有些昵称确实包含空格的，如果可以精确匹配的话就不再需要增量结果了
                let keySplitSpace = matchValue.split(' ')
                for (let kss of keySplitSpace){
                  if (include(nickname, kss)) {
                    match = true;
                    break;
                  }
                }
              }
                */
              
              if (!match){  // 如果仍然无结果，则合并空格进行查找
                var nicknameReplaceSpace = nickname.replace(/ /g, '')
                if (include(nicknameReplaceSpace, matchValueReplaceSpace)) {
                  match = true;
                  break;
                }
              }
            }
          }
          if (match) break
          if (include(target[key], matchValue, key === 'musicTitle')) {
            match = true;
            break;
          }
        }
        if (!match && key == 'musicTitle'){
          for (var mt of target[key]){
            //console.log(mt,matchValue)
            //@ts-ignore
            var musicTitleReplaceSpace = mt?mt.replace(/ /g, ''):null
            if (mt!= null && musicTitleReplaceSpace && include(musicTitleReplaceSpace, matchValueReplaceSpace, true)){
              match = true;
              break;
            }
            if (!match&& mt){  // 如果仍然无结果，则尝试空格拆分，使用歌曲的第一个字进行搜索
              var cmpstr =  splitSpaceAndConcatFirstLetter(mt)
              if(!cmpstr) break;
              if (cmpstr[0] == cmpstr[1] && include(cmpstr[0], matchValueReplaceSpace)) {
                match = true;
                break;
              }else{
                for(let c of cmpstr){
                  if (include(c, matchValueReplaceSpace)){
                    match = true;
                    break;
                  }
                }
              }
            }
            /*
            // TODO：如果仍然没有结果，则拆分match value逐词匹配
            // include中已经包含了该段逻辑了，所以不需要再进行一次拆分匹配了
            if (!match && musicTitleReplaceSpace &&  mt){  // 如果仍然无结果，则尝试空格拆分搜索词
              for (var s of matchValue.split(' ')){
                //console.log(nicknameReplaceSpace,s)
                if (include(musicTitleReplaceSpace, s.toLowerCase())) {
                  match = true;
                  break;
                }
              }
            }
              */
          }

        }
        if (Array.isArray(target[key])) {
          for (let j = 0; j < target[key].length; j++) {
            if (typeof target[key][j] === 'string') {
              //@ts-ignore
              if (include(target[key][j], matchValue, key === 'musicTitle')) {
                match = true;
                break;
              }
            }
          }
        }
        if (match) break;
      }
    }
  }

  return match;
}

function splitSpaceAndConcatFirstLetterBak(str:string){
  if (!str) return null
  var arr = str.split(' ')
  if (arr.length <= 1) return null
  var result = ''
  for (var s of arr){
    result+=s.slice(0,1)
  }
  //console.log(result)
  return result
}

function splitSpaceAndConcatFirstLetter(str:string){
  if (!str) return null
  var arr = str.split(' ')
  if (arr.length <= 1) return null
  var result = ''
  var resultWithChnJpnKon = ''
  for (var s of arr){
    if (checkIfIsChnJpnKon(s)){
      result+=s.slice(0,1)
      resultWithChnJpnKon+=s
    }else{
      resultWithChnJpnKon+=s.slice(0,1)
      result+=s.slice(0,1)
    }
  }
  //console.log(result)
  return [result,resultWithChnJpnKon]
}



// 以下为数字与范围函数
export function checkRelationList(num: number, _relationStrList: string[]): boolean {
  function checkRelation(num: number, _relationStr: string): boolean {
    const comparisonMatch = _relationStr.match(/^(<=|>=|==|=|<|>)(\d+)$/);
    const rangeMatch = _relationStr.match(/^(\d+)-(\d+)$/);

    if (comparisonMatch) {
      const boundary = Number(comparisonMatch[2]);
      switch (comparisonMatch[1]) {
        case '<': return num < boundary;
        case '>': return num > boundary;
        case '<=': return num <= boundary;
        case '>=': return num >= boundary;
        default: return num === boundary;
      }
    }

    if (rangeMatch) {
      const lowerBoundary = parseFloat(rangeMatch[1]);
      const upperBoundary = parseFloat(rangeMatch[2]);
      return num >= lowerBoundary && num <= upperBoundary;
    }

    throw new Error('Invalid relation string format');
  }

  for (let i = 0; i < _relationStrList.length; i++) {
    try {
      if (checkRelation(num, _relationStrList[i])) {
        return true;
      }
    } catch (e) {
      logger('fuzzySearch', "Invalid relation string format");
    }
  }
  return false;
}
// 如果要匹配 夏空 SUN SUN SEVEN
export function checkIfIsChnJpnKon(str:string):boolean{
    return /[\uac00-\ud7ff]|[\u4e00-\u9fa5]/g.test(str)
}
