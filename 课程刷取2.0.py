#!/usr/bin/env python3
"""
EWT360 视频网课助手 - 多课程连刷版
上报 120000ms / 2倍速，间隔 60s，带进度校验，支持逗号分隔多个课程
"""

import math
import sys
import time
import random
import hmac
import hashlib
import requests


# ==================== 配置 ====================
def get_config():
    """交互式获取用户配置"""
    print("=" * 50)
    print("EWT360 视频辅助工具 (多课连刷版)".center(42))
    print("=" * 50)

    token = input("请输入 token: ").strip()
    homework_id = input("请输入 homework 参数: ").strip()
    # 支持逗号分隔
    lesson_ids_str = input("请输入 lesson_id 参数 (多个用逗号分隔): ").strip()
    bizcode = input("请输入 bizcode 参数: ").strip()

    if not all([token, homework_id, lesson_ids_str, bizcode]):
        print("[ERROR] 所有参数均为必填，请重新运行")
        sys.exit(1)

    # 解析多个 lesson_id 并去重过滤空值
    lesson_ids = [pid.strip() for pid in lesson_ids_str.replace("，", ",").split(",") if pid.strip()]
    
    if not lesson_ids:
        print("[ERROR] 未解析到有效的 lesson_id，请重新运行")
        sys.exit(1)

    return {
        "token": token,
        "homework_id": homework_id,
        "lesson_ids": lesson_ids,
        "bizcode": bizcode,
    }


# ==================== 接口请求方法 ====================
def get_school_user_info(token):
    """获取 schoolId 和 userId"""
    url = "https://gateway.ewt360.com/api/eteacherproduct/school/getSchoolUserInfo"
    headers = {"token": token, "Host": "gateway.ewt360.com"}
    print("\n[STEP 1] 获取学校用户信息...")
    resp = requests.get(url, headers=headers)
    data = resp.json()
    if not data.get("success"):
        print(f"[ERROR] 获取用户信息失败: {data}")
        sys.exit(1)
    school_id = data["data"]["schoolId"]
    user_id = data["data"]["userId"]
    print(f" -> schoolId={school_id}, userId={user_id}")
    return school_id, user_id


def get_lesson_detail(token, homework_id, lesson_id, school_id):
    """获取课程详情"""
    url = "https://gateway.ewt360.com/api/homeworkprod/player/getLessonDetailV2"
    headers = {
        "token": token,
        "Content-Type": "application/json; charset=UTF-8",
        "Host": "gateway.ewt360.com",
    }
    body = {
        "homeworkId": homework_id,
        "lessonId": lesson_id,
        "schoolId": school_id,
    }
    print(f"\n[STEP 2] 获取课程 [{lesson_id}] 详情...")
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        data = resp.json()
        if not data.get("success"):
            print(f"[ERROR] 获取课程详情失败: {data}")
            return None

        lesson_data = data["data"]
        play_time_str = lesson_data["playTime"]
        video_play_time = lesson_data["videoPlayTime"]
        content_type = lesson_data.get("contentType", 1)

        minutes_str = play_time_str.split(":")[0]
        point_num = int(minutes_str) + 1

        print(f" -> 课程名称: {lesson_data['lessonName']}")
        print(f" -> playTime={play_time_str} -> point_num={point_num}")
        print(f" -> videoPlayTime={video_play_time}s")
        return point_num, video_play_time, content_type
    except Exception as e:
        print(f"[ERROR] 请求课程详情异常: {e}")
        return None


def get_task_info(token, school_id, homework_id, lesson_id, content_type):
    """获取当前播放进度"""
    url = "https://gateway.ewt360.com/api/homeworkprod/homework/student/getUserHomeworkLessonTaskInfo"
    headers = {
        "Content-Type": "application/json",
        "token": token,
    }
    body = {
        "schoolId": school_id,
        "homeworkId": homework_id,
        "lessonId": lesson_id,
        "contentType": content_type,
    }
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        data = resp.json()
        if not data.get("success"):
            print(f" [WARN] 获取进度失败: {data}")
            return None

        info = data["data"]
        return {
            "playTime": info["playTime"],             # 当前已播放 ms
            "percent": info["percent"],               # 当前完成度 0~1
            "finishPlayTime": info["finishPlayTime"], # 达标所需 ms
            "finishPercent": info["finishPercent"],   # 达标阈值 (0.8)
            "lessonTime": info["lessonTime"],         # 视频总时长 ms
        }
    except Exception as e:
        print(f" [WARN] 获取进度请求异常: {e}")
        return None


def get_player_config(token):
    """获取 secret 和 sessionId"""
    url = (
        "https://gateway.ewt360.com/api/videoplayerprod/videoplayer/"
        f"getPlayerGlobalConf?token={token}"
    )
    headers = {
        "token": token,
        "Host": "gateway.ewt360.com",
        "Accept-Encoding": "gzip",
    }
    print("[STEP 3] 获取播放器配置...")
    resp = requests.get(url, headers=headers)
    data = resp.json()
    if not data.get("success"):
        print(f"[ERROR] 获取播放器配置失败: {data}")
        sys.exit(1)

    secret = data["data"]["globalInfo"]["secret"]
    session_id = data["data"]["globalInfo"]["sessionId"]
    print(f" -> sessionId={session_id}")
    print(f" -> secret={secret[:8]}...")
    return secret, session_id


# ==================== 签名与发包 ====================
def make_signature(secret, action, duration, media_time, mstid, timestamp_ms):
    """HMAC-SHA1 -> hex 小写"""
    raw = (
        f"action={action}"
        f"&duration={duration}"
        f"&mediaTime={media_time}"
        f"&mstid={mstid}"
        f"&platform=2"
        f"&signatureMethod=HMAC-SHA1"
        f"&signatureVersion=1.0"
        f"&timestamp={timestamp_ms}"
        f"&version=2022-08-02"
    )
    sig = hmac.new(
        secret.encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha1,
    ).hexdigest()
    return sig


def build_common_package(user_id, token, school_id):
    return {
        "os": "Android",
        "appBrand": "android",
        "schoolProvinceCode": "320000",
        "memberProvinceCode": "320000",
        "userid": str(user_id),
        "resolution": "1080*2306",
        "platform": "2",
        "appOnline": "1",
        "osVersion": "10",
        "appDeviceModel": "android",
        "appDevId": "0f99d6c0-693e-3f13-abef-60f6af4d9218",
        "schoolId": str(school_id),
        "sdkVersion": "2.0.95-test-rc21",
        "appCarrier": "N/A",
        "appAccess": "NETWORK_MOBILE",
        "mstid": token,
        "appLanguage": "zh",
    }


def submit_round(token, session_id, user_id, school_id, lesson_id, bizcode,
                 action, event_type, stay_time, media_time, point_time,
                 begin_time, point_num, secret):
    timestamp_ms = int(time.time() * 1000)
    signature = make_signature(
        secret, action, stay_time, media_time, token, timestamp_ms
    )

    url = (
        f"https://bfe.ewt360.com/monitor/app/collect/batch"
        f"?TrLessonId={lesson_id}"
        f"&TrVideoBizCode={bizcode}"
        f"&TrUuId=12341234"
        f"&TrFallback=0"
        f"&TrUserId={user_id}"
        f"&token={token}"
    )

    headers = {
        "token": token,
        "x-bfe-session-id": session_id,
        "Content-Type": "application/json; charset=UTF-8",
        "Host": "bfe.ewt360.com",
        "Accept-Encoding": "gzip",
    }

    body = {
        "CommonPackage": build_common_package(user_id, token, school_id),
        "EventPackage": [{
            "log_id": "12341234-1234-1234-1234-123412341234",
            "course_id": lesson_id,
            "appVersion": "11.11.11",
            "point_time": point_time,
            "point_time_id": 0,
            "begin_time": begin_time,
            "lesson_id": lesson_id,
            "speed": 2.0,
            "appChannel": "android",
            "isonline": "1",
            "quality": "高清",
            "video_type": 1,
            "point_num": point_num,
            "event_type": event_type,
            "report_time": timestamp_ms,
            "media_time": media_time,
            "action": action,
            "stay_time": stay_time,
            "video_bizcode": bizcode,
            "status": 1,
        }],
        "signature": signature,
        "sn": "moses_ewt_video_detail_2026",
        "_": timestamp_ms,
    }

    return url, headers, body


# ==================== 单个课程处理逻辑 ====================
def process_single_lesson(token, homework_id, lesson_id, bizcode, school_id, user_id, secret, session_id):
    """处理单个课程的播放流程"""
    # 获取课程详情
    detail = get_lesson_detail(token, homework_id, lesson_id, school_id)
    if not detail:
        print(f"[WARN] 跳过无法获取详情的课程: {lesson_id}")
        return False

    point_num, video_play_time, content_type = detail

    # 查询当前进度
    print("[STEP 2.5] 查询当前进度...")
    task = get_task_info(token, school_id, homework_id, lesson_id, content_type)
    if task is None:
        print(f"[WARN] 无法获取进度，跳过该课程: {lesson_id}")
        return False

    current_play = task["playTime"]
    finish_need = task["finishPlayTime"]
    current_pct = task["percent"] * 100
    threshold_pct = task["finishPercent"] * 100

    print(f" -> 当前进度: {current_play}ms ({current_pct:.1f}%)")
    print(f" -> 达标目标: {finish_need}ms ({threshold_pct:.0f}%)")

    if current_play >= finish_need:
        print("[INFO] 进度已达标，无需刷课")
        return True

    # 计算还需多少轮
    HEARTBEAT = 120000
    INTERVAL = 60000
    remaining_ms = finish_need - current_play
    needed_rounds = math.ceil(remaining_ms / HEARTBEAT)

    print(f" -> 剩余时长: {remaining_ms}ms -> 预计执行 {needed_rounds} 轮 (每轮上报 {HEARTBEAT}ms)")
    print(f"[INFO] 预计当前视频耗时 {needed_rounds} 分钟")
    print("-" * 40)

    begin_time = int(time.time() * 1000)
    last_play = current_play

    for i in range(needed_rounds):
        is_first = (i == 0)
        is_last = (i == needed_rounds - 1)

        if is_first and is_last:
            action = 4
            event_type = "video_oper"
        elif is_first:
            action = 2
            event_type = "video_oper"
        elif is_last:
            action = 4
            event_type = "video"
        else:
            action = 1
            event_type = "video"

        stay_time = HEARTBEAT
        media_time = HEARTBEAT
        point_time = HEARTBEAT

        url, headers, body = submit_round(
            token, session_id, user_id, school_id, lesson_id, bizcode,
            action, event_type, stay_time, media_time, point_time,
            begin_time, point_num, secret,
        )

        print(f"\n[RUN] 第 {i+1}/{needed_rounds} 轮  action={action}  event_type={event_type}")

        try:
            resp = requests.post(url, headers=headers, json=body, timeout=15)
            print(f"      Response -> Code {resp.status_code} | {resp.text[:100]}")
        except Exception as e:
            print(f"      [ERROR] 请求发生异常: {e}")

        # 校验 playTime 是否增长
        time.sleep(1)
        task = get_task_info(token, school_id, homework_id, lesson_id, content_type)
        if task:
            new_play = task["playTime"]
            gain = new_play - last_play
            pct = task["percent"] * 100
            if gain > 0:
                print(f"      Update -> playTime: {last_play} -> {new_play} (+{gain}ms) | {pct:.1f}%")
            else:
                print(f"      [WARN] playTime 未增长: {new_play}ms | {pct:.1f}%")
            last_play = new_play

            # 提前达标则结束
            if new_play >= finish_need:
                print(f"\n[SUCCESS] 当前课程已达标! 当前 {new_play}ms >= 目标 {finish_need}ms")
                return True

        # 间隔 60s 倒计时
        if not is_last and last_play < finish_need:
            delay_ms = INTERVAL + random.randint(-200, 200)
            delay_sec = delay_ms / 1000.0

            remaining_sec = int(delay_sec)
            for sec in range(remaining_sec, 0, -1):
                m, s = divmod(sec, 60)
                bar_len = 20
                done = int((remaining_sec - sec + 1) / remaining_sec * bar_len)
                bar = "█" * done + " " * (bar_len - done)
                print(f"\r      Wait -> [{bar}] {m}:{s:02d}", end="", flush=True)
                time.sleep(1)

            fractional = delay_sec - int(delay_sec)
            if fractional > 0:
                time.sleep(fractional)
            print("")

    # 最终确认
    task = get_task_info(token, school_id, homework_id, lesson_id, content_type)
    if task and task['playTime'] >= finish_need:
        return True
    return False


# ==================== 主流程 ====================
def main():
    config = get_config()
    token = config["token"]
    homework_id = config["homework_id"]
    lesson_ids = config["lesson_ids"]
    bizcode = config["bizcode"]

    total_lessons = len(lesson_ids)
    print(f"[INFO] 成功解析到 {total_lessons} 个课程任务，准备依次执行...")

    # 第一步：获取公共用户信息
    school_id, user_id = get_school_user_info(token)

    # 第三步：获取全局播放器配置（多课程通用）
    secret, session_id = get_player_config(token)

    print("\n" + "=" * 50)
    print("开始执行连刷任务".center(44))
    print("=" * 50)

    # 循环遍历每一个课
    for index, lesson_id in enumerate(lesson_ids, start=1):
        print(f"\n>>>>>> [TASK {index}/{total_lessons}] 正在处理课程 ID: {lesson_id}")
        
        success = process_single_lesson(
            token, homework_id, lesson_id, bizcode, school_id, user_id, secret, session_id
        )
        
        if success:
            print(f"[SUCCESS] [TASK {index}/{total_lessons}] 课程 {lesson_id} 处理完毕。")
        else:
            print(f"[WARN] [TASK {index}/{total_lessons}] 课程 {lesson_id} 未能完全达标或中途跳过。")
            
        if index < total_lessons:
            print("\n" + "-" * 50)
            print("休息 5 秒后自动切换到下一个课程...")
            time.sleep(5)

    print("\n" + "=" * 50)
    print("[SUCCESS] 所有配置的课程任务已执行完毕！")
    print("=" * 50)


if __name__ == "__main__":
    main()
