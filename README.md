# 已失效
不过可以等我过几天研究个新的……
>                          2026-7-14


关于接口的研究进度

最近终于敲定了进度上报的接口，其实本来呢我最早怀疑的就是这个接口


>https://bfe.ewt360.com/monitor/app/collect/batch

虽然看代码还有冗余的clog dlog之类的 不过这不重要

由于ewt的各种加密签名傻了吧唧的写了明文，所以特别好构造它的各种接口，我放弃它的原因就是构造完通过检测验证进度不涨，结果排查了半天彻底崩溃了，就用排除法一个一个把接口禁了，还把冗余也禁了，但进度还是涨，所以我都要开始怀疑连ewt域名都不套的aliyun了


但是最近我换了个排除法把请求体的内容锁定了，发现进度不涨了 想来 之前应该是有什么机制走了别的接口，起码我在web端试是这样
本来之前就把batch的接口研究透了，但服务器隐性的限制太难搞了，很头疼
关于batch sign的算法
>算法类型:HMACSHA1

>key:https://gateway.ewt360.com/api/videoplayerprod/videoplayer/getPlayerGlobalConf 动态获取secret sessionId作为
标识

构造app端>action=1&duration=stay_time&mediaTime=mediaTime&mstid=token&platform=2&signatureMethod=HMAC-SHA1&signatureVersion=1.0&timestamp=当前毫秒时间戳&version=2022-08-02