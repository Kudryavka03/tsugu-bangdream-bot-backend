// 其实就是算一抽值多少个火罐
// 首先我们定义一个分数计算公式
// 假设一抽值0.5个火罐
// 那么公式就是 总分 = 火罐 - (0.5 x 抽数)
var initRatio = 0.5
var total = 230         // 总230抽
var fireBonus = 10     // 10火
var gift = 1            // 1个大奖
var onekey = false
// 假如有一箱里有230个东西：10火 219普通 1大奖
// 假如抽空（火罐最后一个）：2- 0.5 * 4 =0

var best   = []
var choice = []

// n: 还有多少抽    m: 还有多少火罐 ratio: 扣分     k：还有多少大奖
function calc1(n,m,k,ratio){  // 下一箱
    return (fireBonus - m) - ratio * (total-n)
}

function calc2(n,m,k,ratio){    // 分三种情况
    // 如果一键
    if (onekey && k==0){
        return fireBonus - ratio * total;
    }
    // 中火罐
    let s = 0
    if (m>0){   // 中一个火罐，总抽数-1.火罐-1，还没有中大奖
        s = s + (m/n)* best[n - 1][m - 1][k]
    }
    if (k>0){   // 中一个大奖，总抽数-1.大奖-1，没有中火罐
        s = s + (k/n)* best[n - 1][m][k-1]
    }
    if (n-m-k >0){// 中其他
        s = s + ((n - m - k) / n) * best[n - 1][m][k];  // ③ 中普通货
    }
    return s
}

function fillTable(r) {
  // 填冲表格
  best   = [];
  choice = [];
  for (var n = 0; n <= total; n++) {
    best[n] = [];
    choice[n] = [];
    for (var m = 0; m <= fireBonus; m++) {
      best[n][m] = [];
      choice[n][m] = [];
      for (var k = 0; k <= gift; k++) {
        best[n][m][k] = 0;
        choice[n][m][k] = 0;
      }
    }
  }

  // 每个都算一次
  for (var n = 0; n <= total; n++) {
    for (var m = 0; m <= fireBonus; m++) {
      for (var k = 0; k <= gift; k++) {
        if (m + k > n) continue;   // 火罐+奖不能比总抽数多

        var a = calc1(n, m, k, r);   // 换新箱的分
        var b = calc2(n, m, k, r);    // 接着抽的分

        if (n === 0) {
          choice[n][m][k] = 0;     // 没得抽了
        } else if (k > 0) {
          choice[n][m][k] = 1;     // 大奖还没抽走，规则不允许换箱，只能抽
        } else if (b > a) {
          choice[n][m][k] = 1;     // 接着抽更好
        } else {
          choice[n][m][k] = 0;     // 换新箱更豪
        }
        best[n][m][k] = (choice[n][m][k] === 1) ? b : a;   // 谁分高就记谁的
      }
    }
  }
}
//fillTable(initRatio);             // 预填充
var low = 0, high = 1, ans = 0, cut = 0;
while (high - low > 0.0000001) {
  var mid = (low + high) / 2;         // 猜正中间
  fillTable(mid);                     // 按这个标准把整张表重新填一遍
  var score = best[total][fireBonus][gift];   // 开局的最高分
  cut = cut + 1;
  if (score >= 0) {
    low = mid;                        // 达标抬下届
    ans = mid;                        // 记下"最后一次达标的数"
    //console.log("第" + cut + "刀: 猜 " + mid.toFixed(10) + " | 开局最高分 +" + score.toFixed(4) + " | 达标 下界抬到这里");
  } else {
    high = mid;                       // 不达标抬上界
    //console.log("第" + cut + "刀: 猜 " + mid.toFixed(10) + " | 开局最高分 " + score.toFixed(4) + " | 不达标 上界压到这里");
  }
}

fillTable(ans);
for (var m = fireBonus; m >= 0; m--) {
  var th = -1;                        // 找"该换箱"的最小剩余东西数
  for (var n = 0; n <= total; n++) {
    if (n >= m && choice[n][m][0] === 0) { th = n; break; }
  }
  if (th < 0) {
    console.log("剩 " + m + " 个火罐时：换箱怎么都不换箱（把箱子抽完）");
  } else {
    console.log("剩 " + m + " 个火罐时：剩余抽数 ≥ " + th + " 个就换新箱");
  }
}
  
console.log("倍数" + (1 / ans).toFixed(4) +' 一抽等于'+ ans + '火');