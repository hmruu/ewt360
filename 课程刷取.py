import hashlib
import requests
import json

def generate_sign(client_lesson_time, homework_id, lesson_id, play_time):
    """生成sign签名"""
    sign_string = f"eo^nye1j#!wt2%v){client_lesson_time}{homework_id}{lesson_id}{play_time}eo^nye1j#!wt2%v)"
    # MD5加密
    sign = hashlib.md5(sign_string.encode()).hexdigest().lower()
    return sign

def send_request(token, homework_id, lesson_id, play_time=88888888, client_lesson_time=88888888):
    """发送POST请求"""
    url = "https://gateway.ewt360.com/api/homeworkprod/homework/student/updateUserLessonTaskV2"
    
    # 生成sign
    sign = generate_sign(client_lesson_time, homework_id, lesson_id, play_time)
    
    # 请求头
    headers = {
        "platform": "2",
        "version": "99.9.9",
        "token": token,
        "secretId": "1",
        "osVersion": "14",
        "channel": "ewt360",
        "device-type": "phone",
        "device-brand": "Redmi",
        "Content-Type": "application/json; charset=UTF-8",
        "Accept-Encoding": "gzip",
        "User-Agent": "okhttp/3.12.0"
    }
    
    # 请求体
    data = {
        "homeworkId": homework_id,
        "lessonId": lesson_id,
        "playTime": play_time,
        "clientLessonTime": client_lesson_time,
        "sign": sign
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        print(f"\n请求发送成功!")
        print(f"状态码: {response.status_code}")
        print(f"响应内容: {response.text}")
        return response
    except Exception as e:
        print(f"\n请求失败: {str(e)}")
        return None

def main():
    """主函数"""
    print("=" * 50)
    print("课程提交工具")
    print("=" * 50)
    
    # 首次输入token和homeworkId
    token = input("\n请输入token: ").strip()
    homework_id = input("请输入homeworkId: ").strip()
    
    while True:
        print("\n" + "-" * 50)
        lesson_ids_input = input("请输入lessonId (多个用逗号或空格分隔，输入q退出): ").strip()
        
        if lesson_ids_input.lower() == 'q':
            print("\n程序已退出!")
            break
        
        if not lesson_ids_input:
            print("lessonId不能为空，请重新输入!")
            continue
        
        # 解析多个lessonId
        lesson_ids = []
        if ',' in lesson_ids_input:
            lesson_ids = [lid.strip() for lid in lesson_ids_input.split(',') if lid.strip()]
        else:
            lesson_ids = [lid.strip() for lid in lesson_ids_input.split() if lid.strip()]
        
        if not lesson_ids:
            print("未识别到有效的lessonId，请重新输入!")
            continue
        
        # 使用默认值
        play_time = 88888888
        client_lesson_time = 88888888
        
        print(f"\n准备提交 {len(lesson_ids)} 个lessonId...")
        
        # 依次发送请求
        for index, lesson_id in enumerate(lesson_ids, 1):
            print(f"\n[{index}/{len(lesson_ids)}] 正在处理 lessonId: {lesson_id}")
            send_request(token, homework_id, lesson_id, play_time, client_lesson_time)
        
        print(f"\n✓ 已完成 {len(lesson_ids)} 个lessonId的提交!")
        
        # 询问是否继续
        continue_flag = input("\n是否继续提交? (y/n): ").strip().lower()
        if continue_flag != 'y':
            print("\n程序已退出!")
            break

if __name__ == "__main__":
    main()