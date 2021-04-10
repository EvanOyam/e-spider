import React, { useEffect, useState } from 'react';
import {
  Card,
  Avatar,
  List,
  Table,
  Modal,
  Form,
  Input,
  message,
  Spin,
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import styled from '@emotion/styled';
import { ipcRenderer } from 'electron';
import moment from 'moment';
import path from 'path';
import fs from 'fs';
import btc from '../assets/btc.svg';
import avatar from '../assets/avatar.jpg';
import tips1 from '../assets/tips1.png';
import tips2 from '../assets/tips2.png';
import tips3 from '../assets/tips3.png';

const { Column } = Table;
const { Meta } = Card;
const { Search } = Input;
const { confirm } = Modal;

const Wrapper = styled.div`
  padding: 36px;
`;

const Cover = styled.div`
  width: 100vw;
  height: 360px;
  display: flex;
  background-color: #f7931a;
  align-items: center;
  justify-content: center;
`;

const Font = styled.a`
  font-size: 16px;
`;

interface Logger {
  key: number;
  idx: number;
  msg: string;
  desc: string;
  time: string;
}

export default function Spider() {
  const data = ['1. 登录微博获取权限', '2. 输入爬虫配置', '3. 开始！'];
  const [form] = Form.useForm();
  const [logger, setLogger] = useState([] as Logger[]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showSpin, setShowSpin] = useState(false);

  // 初始化日志
  useEffect(() => {
    setLogger((prevLogger) => {
      const log = {
        key: +new Date(),
        idx: prevLogger.length + 1,
        msg: '初始化程序',
        desc: '暂无详细信息',
        time: moment().format('YYYY.MM.DD HH:mm:ss'),
      };
      return [...prevLogger, log];
    });
  }, []);

  // 监听主进程数据
  useEffect(() => {
    ipcRenderer.on('customLog', (event: any, msg: string[]) => {
      setLogger((prevLogger) => {
        const log = {
          key: +new Date(),
          idx: prevLogger.length + 1,
          msg: msg[0],
          desc: msg[1] || '暂无详细信息',
          time: moment().format('YYYY.MM.DD HH:mm:ss'),
        };
        return [...prevLogger, log];
      });
    });
    return () => {
      ipcRenderer.removeAllListeners('customLog');
    };
  }, []);

  // 监听爬虫完成，status 1表示处理数据，2表示可以导出
  useEffect(() => {
    ipcRenderer.on(
      'finished',
      (event: any, status: number, csvPath: string) => {
        if (status === 1) {
          setShowSpin(true);
        }
        if (status === 2) {
          setShowSpin(false);
          confirm({
            title: '数据处理完成，是否导出 csv?',
            icon: <ExclamationCircleOutlined />,
            content: '如果取消需要重新爬取数据！',
            okText: '导出',
            cancelText: '取消',
            onOk() {
              setLogger((prevLogger) => {
                const log = {
                  key: +new Date(),
                  idx: prevLogger.length + 1,
                  msg: '开始导出数据',
                  desc: '暂无详细信息',
                  time: moment().format('YYYY.MM.DD HH:mm:ss'),
                };
                return [...prevLogger, log];
              });
              ipcRenderer.invoke('export', csvPath);
            },
          });
        }
      }
    );
    return () => {
      ipcRenderer.removeAllListeners('finished');
    };
  }, []);

  // 点击登录按钮
  const login = async () => {
    setLogger((prevLogger) => {
      const log = {
        key: +new Date(),
        idx: prevLogger.length + 1,
        msg: '等待登录',
        desc: '暂无详细信息',
        time: moment().format('YYYY.MM.DD HH:mm:ss'),
      };
      return [...prevLogger, log];
    });
    await ipcRenderer.invoke('login');
  };

  // 点击配置按钮
  const config = async () => {
    setIsModalVisible(true);
  };

  // 点击开始按钮
  const start = async () => {
    const cookiesPath = path.join(__dirname, '..', 'assets', 'cookies.json');
    const isExistCookies = fs.existsSync(cookiesPath);
    if (!isExistCookies) {
      setLogger((prevLogger) => {
        const log = {
          key: +new Date(),
          idx: prevLogger.length + 1,
          msg: '缺少登录态，请先登录',
          desc: '暂无详细信息',
          time: moment().format('YYYY.MM.DD HH:mm:ss'),
        };
        return [...prevLogger, log];
      });
      message.error('请先登录');
      return;
    }
    const id = form.getFieldValue('id');
    if (!id) {
      setLogger((prevLogger) => {
        const log = {
          key: +new Date(),
          idx: prevLogger.length + 1,
          msg: '请设置需要爬取的id',
          desc: '暂无详细信息',
          time: moment().format('YYYY.MM.DD HH:mm:ss'),
        };
        return [...prevLogger, log];
      });
      message.error('请设置需要爬取的id');
      return;
    }

    const page = form.getFieldValue('page');
    if (!page) {
      setLogger((prevLogger) => {
        const log = {
          key: +new Date(),
          idx: prevLogger.length + 1,
          msg: '请设置需要爬的页码',
          desc: '暂无详细信息',
          time: moment().format('YYYY.MM.DD HH:mm:ss'),
        };
        return [...prevLogger, log];
      });
      message.error('请设置需要爬的页码');
      return;
    }

    await ipcRenderer.invoke('spider', id, parseInt(page, 10));
  };

  // 检查用户链接有效性
  const onSearch = async (value: string) => {
    if (!value) return;
    const url = `https://www.weibo.com/${value}?topnav=1&wvr=6&topsug=1`;
    await ipcRenderer.invoke('checkLink', url);
  };

  // 保存配置
  const handleOk = () => {
    form
      .validateFields(['id'])
      .then((val) => {
        setIsModalVisible(false);
        setLogger((prevLogger) => {
          const log = {
            key: +new Date(),
            idx: prevLogger.length + 1,
            msg: '更新配置成功',
            desc: '暂无详细信息',
            time: moment().format('YYYY.MM.DD HH:mm:ss'),
          };
          return [...prevLogger, log];
        });
        return val;
      })
      .catch((e) => {
        message.error('无效的用户id');
        setLogger((prevLogger) => {
          const log = {
            key: +new Date(),
            idx: prevLogger.length + 1,
            msg: '更新配置失败',
            desc: '无效的用户id',
            time: moment().format('YYYY.MM.DD HH:mm:ss'),
          };
          return [...prevLogger, log];
        });
      });
  };

  // 关闭配置弹窗
  const handleCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <>
      <Spin spinning={showSpin} tip="正在处理数据...">
        <Card
          cover={
            <Cover>
              <img src={btc} alt="" />
            </Cover>
          }
          actions={[
            <Font key="login" onClick={login}>
              登录
            </Font>,
            <Font key="config" onClick={config}>
              配置
            </Font>,
            <Font onClick={start} key="start">
              开始
            </Font>,
          ]}
        >
          <Meta
            avatar={<Avatar src={avatar} />}
            title="使用教程"
            description={
              <List
                dataSource={data}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            }
          />
        </Card>
        <Wrapper>
          <h3>日志</h3>
          <Table
            bordered
            dataSource={logger}
            expandable={{
              expandedRowRender: function expanded(record) {
                return <p style={{ margin: 0 }}>{record.desc}</p>;
              },
            }}
          >
            <Column title="编号" dataIndex="idx" key="idx" />
            <Column title="日志" dataIndex="msg" key="msg" />
            <Column title="时间" dataIndex="time" key="time" />
          </Table>
        </Wrapper>
        <Modal
          title="配置"
          visible={isModalVisible}
          onOk={handleOk}
          onCancel={handleCancel}
          okText="保存配置"
          cancelText="取消"
        >
          <Form
            form={form}
            labelCol={{ span: 4 }}
            wrapperCol={{ span: 20 }}
            name="form"
          >
            <Form.Item
              label="ID"
              name="id"
              rules={[{ required: true, message: '请输入需要爬取的用户 id' }]}
            >
              <Search
                enterButton="测试"
                placeholder="用户 id"
                onSearch={onSearch}
              />
            </Form.Item>
            <Form.Item
              label="页码"
              name="page"
              rules={[
                {
                  required: true,
                  message: '请输入页码，如 32 表示爬 1-32 页的数据',
                },
              ]}
            >
              <Input placeholder="请输入页码，如 32 表示爬 1-32 页的数据" />
            </Form.Item>
          </Form>
          <p>1. 直接在微博首页搜索用户</p>
          <p>2. 进入用户主页，复制 id，如这里的 hu_ge，点击测试按钮检查</p>
          <p>3. 输入需要爬取的页数，注意不要大于页码总数</p>
          <p>4. 确认无误后在弹窗底部点击保存</p>
          <img style={{ width: '100%' }} src={tips1} alt="" />
          <img style={{ width: '100%' }} src={tips2} alt="" />
          <img style={{ width: '100%' }} src={tips3} alt="" />
        </Modal>
      </Spin>
    </>
  );
}
