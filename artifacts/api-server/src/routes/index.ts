import { Router, type IRouter } from "express";
import healthRouter from "./health";
import businessProfileRouter from "./businessProfile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(businessProfileRouter);

export default router;
