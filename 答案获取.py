#!/usr/bin/env python3
import requests
import re
from typing import Any

BASE_URL = "https://gateway.ewt360.com"
UA = "Mozilla/5.0"


def get_report_id(paper_id: str, token: str, biz_code: str = "201") -> str:
    url = f"{BASE_URL}/api/answerprod/web/answer/report"
    params = {"paperId": paper_id, "platform": "1", "bizCode": biz_code, "token": token}
    resp = requests.get(url, params=params, headers={"User-Agent": UA})
    resp.raise_for_status()
    data = resp.json()
    if not data["success"]:
        raise Exception(data)
    return data["data"]["reportId"]


def get_questions(paper_id: str, report_id: str, token: str) -> list[dict[str, Any]]:
    url = f"{BASE_URL}/api/answerprod/common/answer/sheet/getAnswerSheetSubGroup"
    body = {
        "paperId": paper_id, "reportId": report_id, "platform": "1",
        "bizCode": "201", "homeworkId": "0", "client": 4,
    }
    resp = requests.post(url, json=body, headers={"User-Agent": UA, "token": token})
    resp.raise_for_status()
    data = resp.json()
    if not data["success"]:
        raise Exception(data)
    questions: list[dict[str, Any]] = []
    for group in data["data"]["groupQuestionList"]:
        for q in group["questionList"]:
            questions.append({
                "questionId": q["questionId"],
                "questionNumber": q["questionNumber"],
                "cateId": q.get("cateId", 1),
                "subjective": q.get("subjective", False),
                "groupName": group.get("groupName", ""),
            })
    return questions


def update_report(paper_id: str, report_id: str, token: str) -> None:
    url = f"{BASE_URL}/api/answerprod/web/answer/submitpaper"
    body = {
        "paperId": paper_id, "reportId": report_id, "bizCode": "201",
        "platform": "1", "totalSeconds": 600, "homeworkId": "0",
    }
    resp = requests.post(url, json=body, headers={"User-Agent": UA, "token": token})
    resp.raise_for_status()
    if not resp.json()["success"]:
        raise Exception(resp.json())


def get_answer(paper_id: str, report_id: str, question_id: str, token: str) -> dict[str, Any]:
    url = f"{BASE_URL}/api/answerprod/web/answer/simple/question/analysis"
    body = {
        "paperId": paper_id, "reportId": report_id, "platform": "1",
        "questionId": question_id, "bizCode": "201", "homeworkId": "0", "client": 4,
    }
    resp = requests.post(url, json=body, headers={"User-Agent": UA, "token": token})
    resp.raise_for_status()
    return resp.json()


def submit_answers(paper_id: str, report_id: str, questions: list[dict[str, Any]],
                   answers_map: dict[str, list[str]], token: str) -> bool:
    url = f"{BASE_URL}/api/answerprod/web/answer/submitAnswer"
    question_list = []
    for q in questions:
        qid = q["questionId"]
        if qid in answers_map:
            flat = []
            for opt in answers_map[qid]:
                flat.extend(list(opt))
            question_list.append({
                "id": qid, "myAnswers": flat,
                "questionNo": int(q["questionNumber"]),
                "questionNumber": q["questionNumber"],
                "totalSeconds": 0, "cateId": q["cateId"],
            })
    if not question_list:
        return False
    body = {
        "paperId": paper_id, "reportId": report_id, "platform": "1",
        "questionList": question_list, "bizCode": "205", "assignPoints": False,
    }
    resp = requests.post(url, json=body, headers={"User-Agent": UA, "token": token})
    resp.raise_for_status()
    return resp.json().get("success", False)


def clean_html(text: str) -> str:
    text = re.sub(r"<img[^>]*Wirisformula[^>]*>", "[公式]", text)
    text = re.sub(r"<br[^>]*>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&ldquo;", "\u201c").replace("&rdquo;", "\u201d")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +", " ", text)
    return text.strip()


def extract_opts(right_answer: list) -> list[str]:
    return [x.strip() for x in right_answer if re.fullmatch(r"[A-Z]+", x.strip())]


def main():
    print("=" * 50)
    print("  答案提取器")
    print("=" * 50)

    token = input("请输入 token: ").strip()
    if not token:
        return print("[错误] token 不能为空")

    paper_id = input("请输入 paperId: ").strip()
    if not paper_id:
        return print("[错误] paperId 不能为空")

    print()

    try:
        rid = get_report_id(paper_id, token)
        questions = get_questions(paper_id, rid, token)
        update_report(paper_id, rid, token)

        choice_answers: dict[str, list[str]] = {}
        print(f"共 {len(questions)} 题\n")

        for q in questions:
            qid = q["questionId"]
            result = get_answer(paper_id, rid, qid, token)
            if not result["success"]:
                print(f"第{q['questionNumber']}题 获取失败")
                continue

            d = result["data"]
            opts = extract_opts(d.get("rightAnswer", []))
            if opts and not q["subjective"]:
                choice_answers[qid] = opts

            knowledges = "、".join(k["title"] for k in d.get("knowledges", []))
            analysis = clean_html(d.get("analyse", ""))

            print(f"[{q['questionNumber']}] {q['groupName']}")
            if opts:
                print(f"  答案: {', '.join(''.join(list(o)) for o in opts)}")
            elif d.get("rightAnswer"):
                print(f"  答案: {clean_html(d['rightAnswer'][0])}")
            else:
                print(f"  答案: (主观题)")
            if knowledges:
                print(f"  知识点: {knowledges}")
            if analysis:
                print(f"  解析: {analysis[:120]}{'...' if len(analysis) > 120 else ''}")
            print()

        if choice_answers:
            ans = input(f"检测到 {len(choice_answers)} 道选择题答案，提交到云端? (y/n): ").strip().lower()
            if ans == "y":
                new_rid = get_report_id(paper_id, token, biz_code="205")
                ok = submit_answers(paper_id, new_rid, questions, choice_answers, token)
                print("提交成功" if ok else "提交失败")
            else:
                print("已跳过提交")

    except requests.RequestException as e:
        print(f"网络错误: {e}")
    except Exception as e:
        print(f"错误: {e}")


if __name__ == "__main__":
    main()
