# run_prediction.py
import traceback
import time
from io import BytesIO
import pandas as pd
from datetime import datetime, timedelta, timezone
import os
import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg

from config import DEFAULT_CONFIG
from data_source import BestdoriDataSource
from domain_models import EventData, EventMeta
from math_models import SeasonalityHandler, CosineModeler
from prediction_engine import PredictionEngine
from visualizer import Visualizer


# ==========================================
# 工具函数（原样复用）
# ==========================================
def wrap_event_data(data_pack) -> EventData:
    """将原始数据包转换为领域对象"""
    if not data_pack: return None
    meta_obj = data_pack['meta']
    if isinstance(meta_obj, dict):
        meta_obj = EventMeta.from_dict(data_pack['event_id'], meta_obj)
        
    return EventData(
        meta=meta_obj,
        df=data_pack['dataframe'],
        scale=data_pack['scale']
    )

def calculate_derived_columns(event_data: EventData) -> EventData:
    """计算派生列：hours_elapsed, speed, norm_speed"""
    df = event_data.df
    event_data.clean_data()
    
    # 维护延迟修复
    original_start = event_data.meta.start_at
    valid_points = df[df['value'] > 0]
    if not valid_points.empty:
        first_valid_ts = valid_points.iloc[0]['time']
        # 限制修正范围在开服 24 小时内，避免误判
        if first_valid_ts > original_start and (first_valid_ts - original_start) < 86400000:
            from datetime import datetime, timezone
            # 注意：这里假设 timestamp 是 UTC 时间戳
            dt_first = datetime.fromtimestamp(first_valid_ts / 1000, timezone.utc)
            # 向下取整到小时 (或者根据实际需求调整)
            dt_corrected = dt_first.replace(minute=0, second=0, microsecond=0)
            corrected_start = int(dt_corrected.timestamp() * 1000)
            
            if corrected_start > original_start:
                # 在 Streamlit 里可以用 st.toast 或 print
                # print(f"检测到维护延迟，修正 start_at")
                event_data.meta.start_at = corrected_start

    start_ts = event_data.meta.start_at
    df['hours_elapsed'] = (df['time'] - start_ts) / 3600000.0
    
    if 'speed' not in df.columns:
        diff_val = df['value'].diff()
        diff_time = df['time'].diff() / 60000.0 
        speed = diff_val / diff_time
        df['speed'] = speed.fillna(0.0)
        df.loc[~np.isfinite(df['speed']), 'speed'] = 0.0
        df.loc[df['speed'] < 0, 'speed'] = 0.0
        
    if 'norm_speed' not in df.columns:
        df['norm_speed'] = df['speed'] / event_data.scale
        
    event_data.df = df
    return event_data


# ==========================================
# 主预测流程
# ==========================================
def run_prediction(
    event_id: int | None = None,
    debug_hours: float | None = None,
    save_image: bool = True
):
    ds = BestdoriDataSource(2000) # 获取tier = 1000的活动

    try:
        # 1. 获取 Event ID
        target_eid = event_id or ds.get_current_event_id()
        if not target_eid:
            raise RuntimeError("无法获取当前活动 ID")

        print(f"[INFO] Target Event ID: {target_eid}")

        # 2. 获取目标活动数据
        target_pack = ds.fetch_event_data_pack(target_eid)
        if not target_pack:
            raise RuntimeError(f"无法获取活动 {target_eid} 数据")

        target_data = wrap_event_data(target_pack)
        target_data = calculate_derived_columns(target_data)
        target_data.full_df = target_data.df.copy()
        start_ts = target_data.meta.start_at
        tz_utc8 = timezone(timedelta(hours=8))
        # Debug 截断
        if debug_hours:
            limit_ts = target_data.meta.start_at + debug_hours * 3600 * 1000
            target_data.df = target_data.df[target_data.df['time'] <= limit_ts].copy()
            print(f"[DEBUG] Freeze at {debug_hours}h")

        # 3. 获取历史相似活动
        similar_packs = ds.find_similar_events(
            target_eid,
            target_data.meta.event_type,
            count=DEFAULT_CONFIG.get('similar_count', 5),
            ignore_ids = DEFAULT_CONFIG.get('ignore_event_ids')
        )

        history_events = []
        for pack in similar_packs:
            h_data = wrap_event_data(pack)
            try:
                h_data = calculate_derived_columns(h_data)
                history_events.append(h_data)
            except: pass

        print(f"[INFO] Loaded {len(history_events)} history events")

        # 4. 初始化预测引擎
        seasonality = SeasonalityHandler(
            weekend_multiplier=DEFAULT_CONFIG['weekend_multiplier'],
            panic_scaler=DEFAULT_CONFIG['panic_scaler'],
            panic_ease_power=DEFAULT_CONFIG['panic_ease_power']
        )
        modeler = CosineModeler()
        engine = PredictionEngine(seasonality, modeler, config=DEFAULT_CONFIG)
        visualizer = Visualizer()

        # 5. 执行预测
        result = engine.predict(
            target_data,
            history_events
        )

        print(f"[RESULT] Final Prediction: {int(result.final_score):,}")
        os.rename("temp.json","ycx2000-3.json")
        # 6. 保存预测图
        if save_image:
            fig = visualizer.plot_prediction(
                target_data,
                result,
                debug_hours=debug_hours,
                save=False
            )

            buf = BytesIO()
            FigureCanvasAgg(fig).print_png(buf)

            beijing_tz = timezone(timedelta(hours=8))
            ts = datetime.now(beijing_tz).strftime("%Y%m%d_%H%M%S")
            filename = f"prediction_event_{target_eid}_{ts}.png"

            with open(filename, "wb") as f:
                f.write(buf.getvalue())

            print(f"[INFO] Image saved: {filename}")

        return result

    finally:
        ds.close()


# ==========================================
# CLI 入口
# ==========================================
if __name__ == "__main__":
    try:
        run_prediction(
            event_id=None,      # 或指定具体 ID
            debug_hours=None,   # 如 60.0
            save_image=False
        )
    except Exception as e:
        print("[ERROR]", e)
        print(traceback.format_exc())
