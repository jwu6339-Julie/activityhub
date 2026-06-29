module.exports = function handler(req, res) {
  return res.status(200).json({
    success: false,
    message: "演示版暂未启用 AI 提取，请使用后台手动录入。"
  });
};
