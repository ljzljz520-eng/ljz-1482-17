import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "../utils/errors.js";
import { logger } from "../config/logger.js";

export const notFound = (req, res, next) => {
  next(new HttpError(404, `接口不存在: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "请求参数不合法",
      details: error.flatten()
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message, details: error.details });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "资源不存在或已被删除" });
    }
    if (error.code === "P2002") {
      return res.status(409).json({ message: "请求重复或唯一约束冲突" });
    }
  }

  if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
    return res.status(401).json({ message: "登录状态已失效" });
  }

  logger.error({ err: error, path: req.originalUrl }, "Unhandled API error");
  return res.status(500).json({ message: "服务暂时不可用，请稍后重试" });
};
