// 其实就是算一抽值多少个火罐
// 首先我们定义一个分数计算公式
// 假设一抽值0.5个火罐
// 那么公式就是 总分 = 火罐 - (0.5 x 抽数)

export class FireBonusCalculator {
  #total: number;
  #fireBonus: number;
  #gift: number;
  #onekey: boolean;

  initRatio = 0.5;
  best: number[][][] = [];
  choice: number[][][] = [];

  constructor(total = 230, fireBonus = 10, gift = 1, onekey = false) {
    this.#total = total;
    this.#fireBonus = fireBonus;
    this.#gift = gift;
    this.#onekey = onekey;
  }

  // n: 还有多少抽    m: 还有多少火罐 ratio: 扣分     k：还有多少大奖
  calc1(n: number, m: number, k: number, ratio: number) {  // 下一箱
    return (this.#fireBonus - m) - ratio * (this.#total - n);
  }

  calc2(n: number, m: number, k: number, ratio: number) {    // 分三种情况
    // 如果一键
    if (this.#onekey && k === 0) {
      return this.#fireBonus - ratio * this.#total;
    }
    // 中火罐
    let s = 0;
    if (m > 0) {   // 中一个火罐，总抽数-1.火罐-1，还没有中大奖
      s = s + (m / n) * this.best[n - 1][m - 1][k];
    }
    if (k > 0) {   // 中一个大奖，总抽数-1.大奖-1，没有中火罐
      s = s + (k / n) * this.best[n - 1][m][k - 1];
    }
    if (n - m - k > 0) { // 中其他
      s = s + ((n - m - k) / n) * this.best[n - 1][m][k];  // 中普通货
    }
    return s;
  }

  fillTable(r: number) {
    // 填冲表格
    this.best = [];
    this.choice = [];
    for (let n = 0; n <= this.#total; n++) {
      this.best[n] = [];
      this.choice[n] = [];
      for (let m = 0; m <= this.#fireBonus; m++) {
        this.best[n][m] = [];
        this.choice[n][m] = [];
        for (let k = 0; k <= this.#gift; k++) {
          this.best[n][m][k] = 0;
          this.choice[n][m][k] = 0;
        }
      }
    }

    // 每个都算一次
    for (let n = 0; n <= this.#total; n++) {
      for (let m = 0; m <= this.#fireBonus; m++) {
        for (let k = 0; k <= this.#gift; k++) {
          if (m + k > n) continue;   // 火罐+奖不能比总抽数多

          const a = this.calc1(n, m, k, r);   // 换新箱的分
          const b = this.calc2(n, m, k, r);    // 接着抽的分

          if (n === 0) {
            this.choice[n][m][k] = 0;     // 没得抽了
          } else if (k > 0) {
            this.choice[n][m][k] = 1;     // 大奖还没抽走，规则不允许换箱，只能抽
          } else if (b > a) {
            this.choice[n][m][k] = 1;     // 接着抽更好
          } else {
            this.choice[n][m][k] = 0;     // 换新箱更豪
          }
          this.best[n][m][k] = (this.choice[n][m][k] === 1) ? b : a;   // 谁分高就记谁的
        }
      }
    }
  }

  run() {
    let low = 0;
    let high = 1;
    let ans = 0;
    let info:fireBonusGacha[] = []
    while (high - low > 0.0000001) {
      const mid = (low + high) / 2;         // 猜正中间
      this.fillTable(mid);                   // 按这个标准把整张表重新填一遍
      const score = this.best[this.#total][this.#fireBonus][this.#gift];   // 开局的最高分
      if (score >= 0) {
        low = mid;                        // 达标抬下届
        ans = mid;                        // 记下"最后一次达标的数"
      } else {
        high = mid;                       // 不达标抬上界
      }
    }

    this.fillTable(ans);
    for (let m = this.#fireBonus; m >= 0; m--) {
      let th = -1;                        // 找"该换箱"的最小剩余东西数
      for (let n = 0; n <= this.#total; n++) {
        if (n >= m && this.choice[n][m][0] === 0) { th = n; break; }
      }
      if (th < 0) {
        //console.log("剩 " + m + " 个火罐时：换箱怎么都不换箱（把箱子抽完）");
        info.push({fire:m,count:-1})
      } else {
        //console.log("剩 " + m + " 个火罐时：剩余抽数 ≥ " + th + " 个就换新箱");
        info.push({fire:m,count:th})
      }
    }
    info.push({fire:-1,count:ans})
    console.log("倍数" + (1 / ans).toFixed(4) + ' 一抽等于' + ans + '火');
    return ans;
  }
}

export default FireBonusCalculator;

/*
    总得分=(所得火罐) - 惩罚分数 * 剩余多少抽
    惩罚分数就是指每一抽相当于多少火罐
    然后一抽分为三种情况：火罐/特别礼物/普通物件
    然后用第二条公式去计算这三种情况累计分数。计算公式是剩余火罐/特别礼物/普通物件 除以剩余抽数
    然后分别比较一、二条公式谁的分数高，就算进去，一直算到最后得到最高分
    整个过程能变的就是惩罚分数，由于惩罚分数区间是0-1（一抽只能1个火罐），所以用二分法找出最佳点位（最后的总分），这个点位就是最佳倍率。1/惩罚分数 即为最佳倍率
*/
export type fireBonusGacha={
    fire:number,
    count:number
}