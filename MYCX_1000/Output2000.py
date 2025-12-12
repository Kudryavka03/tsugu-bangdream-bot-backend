import time
import traceback
from datetime import datetime, timedelta, timezone

from config import DEFAULT_CONFIG
from predictor import DataHandler, fetch_recent_json, get_current_event_for_server


def main():
    try:
        # 1. 获取活动 ID
        recent = fetch_recent_json()
        target_event_id = get_current_event_for_server(recent, server_index=3)

        if target_event_id is None:
            print("❌ 未找到活动 ID")
            return

        print(f"目标活动: Event {target_event_id}")

        # 2. 配置项（可调整）
        user_config_overrides = {
            'weekend_multiplier': DEFAULT_CONFIG.get('weekend_multiplier', 1.0),
            'panic_scaler': float(DEFAULT_CONFIG.get('panic_scaler', 1.1)),
            'panic_ease_power': float(DEFAULT_CONFIG.get('panic_ease_power', 1.0)),
            'similar_count': int(DEFAULT_CONFIG.get('similar_count', 5)),
            'ratio_min': float(DEFAULT_CONFIG.get('ratio_min', 0.25)),
            'ratio_max': float(DEFAULT_CONFIG.get('ratio_max', 4.0)),
            'scale_min': float(DEFAULT_CONFIG.get('scale_min', 0.5)),
            'scale_max': float(DEFAULT_CONFIG.get('scale_max', 2.0)),
            't_start_cmp': float(DEFAULT_CONFIG.get('t_start_cmp', 6.0)),
            't_end_cap': float(DEFAULT_CONFIG.get('t_end_cap', 72.0)),
            'corr_min': float(DEFAULT_CONFIG.get('corr_min', 0.6)),
            'corr_max': float(DEFAULT_CONFIG.get('corr_max', 1.6)),
            'smooth_thresh1': float(DEFAULT_CONFIG.get('smooth_thresh1', 0.5)),
            'smooth_thresh2': float(DEFAULT_CONFIG.get('smooth_thresh2', 0.65)),
            'smooth_hard_cap': float(DEFAULT_CONFIG.get('smooth_hard_cap', 0.8)),

        }

        # 3. 构建 Handler
        handler = DataHandler(
            target_event_id,
            debug_hours=None,
            config_overrides=user_config_overrides
        )
        tiers = 2000
        # 4. 加载数据
        handler.load_target_data(tiers)
        handler.find_similar_events(None,tiers=tiers)

        print("开始计算预测...")
        img_bytes = handler.run_prediction(return_type="bytes",tiers=tiers)

        if img_bytes is None:
            print("❌ 未生成图片")
            return

        # 5. 输出图片
        out_path = "prediction.png"
        with open(out_path, "wb") as f:
            f.write(img_bytes)

        # 北京时间
        beijing_tz = timezone(timedelta(hours=8))
        now_bj = datetime.now(beijing_tz).strftime('%H:%M:%S (北京时间)')

        print(f"✅ 预测完成！图片已保存: {out_path}")
        print(f"更新时间: {now_bj}")

    except Exception as e:
        print("❌ 运行出错：")
        print(e)
        print(traceback.format_exc())


if __name__ == "__main__":
    main()
