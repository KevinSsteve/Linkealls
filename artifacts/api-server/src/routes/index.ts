import { Router, type IRouter } from "express";
import healthRouter from "./health";
import businessProfileRouter from "./businessProfile";
import leadsRouter from "./leads";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(businessProfileRouter);
router.use(leadsRouter);
router.use(assistantRouter);

export default router;
