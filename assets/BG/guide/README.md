# GUIDE 背景素材

来自 [BanG Dream! 官方 GUIDE](https://bang-dream.bushimo.jp/guide/) 的公共背景图片，保留原文件内容，在本地加载以支持离线出图。

原地址基路径：
`https://bang-dream.bushimo.jp/wordpress/wp-content/themes/bang-dream_gbp_v2/assets/images/`

| 本地文件 | 原文件 | 尺寸 |
| --- | --- | --- |
| pc-gradation.png | pc/bg_pattern_gradation.png | 1920×2560 |
| pc-icon.png | pc/bg_pattern_icon.png | 912×693 |
| pc-text.png | pc/bg_pattern_text.png | 1920×600 |
| sp-gradation.png | sp/bg_pattern_gradation.png | 768×1024 |
| sp-icon.png | sp/bg_pattern_icon.png | 768×820 |
| sp-text.png | sp/bg_pattern_text.png | 768×321 |
| section-heading-dots.png | common/bg_dot_right-end.png | 176×110 |

绘制依据 [官网 CSS](https://bang-dream.bushimo.jp/wordpress/wp-content/themes/bang-dream_gbp_v2/assets/css/guide/style.css)：先渐变、后图标、再描边文字，三层分别平铺。宽度不超过 1024px 使用 SP 素材；PC 渐变至少 1920px 宽且居中，图标宽度固定 912px。素材权利归原权利方所有。

区块标题装饰使用官网原始 `bg_dot_right-end.png`，按 `100% 100% / 125px auto no-repeat` 右下对齐，保留 PNG 的原始透明度，超出标题的部分裁切。项目固定 70px 标题槽采用官网桌面 125px 尺寸；侧标题使用同一素材并随文字旋转。
